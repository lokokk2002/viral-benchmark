import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.5-flash";

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }

  const json = await res.json();
  return (
    json.candidates?.[0]?.content?.parts?.[0]?.text || ""
  );
}

function parseTimecodes(raw: string): { timecode: string; scene: string; dialogue: string }[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  const results: { timecode: string; scene: string; dialogue: string }[] = [];

  // 嘗試解析 JSON 格式
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          timecode: item.timecode || item.time || "",
          scene: item.scene || item.visual || item.description || "",
          dialogue: item.dialogue || item.script || item.text || "",
        }));
      }
    }
  } catch {
    // fallback to line parsing
  }

  // 解析 markdown 表格或文字格式
  for (const line of lines) {
    // 格式: 00:00-00:03 | 畫面描述 | 台詞
    const pipeMatch = line.match(
      /(\d{2}:\d{2}(?:-\d{2}:\d{2})?)\s*[|\t]\s*(.+?)\s*[|\t]\s*(.*)/
    );
    if (pipeMatch) {
      results.push({
        timecode: pipeMatch[1],
        scene: pipeMatch[2].trim(),
        dialogue: pipeMatch[3].trim(),
      });
      continue;
    }

    // 格式: **00:00-00:03** 畫面描述 / 台詞
    const boldMatch = line.match(
      /\*?\*?(\d{2}:\d{2}(?:-\d{2}:\d{2})?)\*?\*?\s*[：:]\s*(.+)/
    );
    if (boldMatch) {
      const parts = boldMatch[2].split(/[/／|｜]/);
      results.push({
        timecode: boldMatch[1],
        scene: parts[0]?.trim() || "",
        dialogue: parts[1]?.trim() || "",
      });
    }
  }

  return results;
}

// =============================================
// POST /api/generate-script
// 接收: { queue_item_id } 或 { queue_item_ids: [] } (批次)
// =============================================
export async function POST(request: NextRequest) {
  const body = await request.json();
  const ids: string[] = body.queue_item_ids || (body.queue_item_id ? [body.queue_item_id] : []);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "queue_item_id or queue_item_ids required" },
      { status: 400 }
    );
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const results: { id: string; status: string; error?: string }[] = [];

  for (const queueId of ids) {
    try {
      // 標記為 generating
      await supabase
        .from("vb_shoot_queue")
        .update({ status: "generating" })
        .eq("id", queueId);

      // 讀取 queue item + viral_video
      const { data: item } = await supabase
        .from("vb_shoot_queue")
        .select("*, viral_video:vb_viral_videos(*)")
        .eq("id", queueId)
        .single();

      if (!item || !item.viral_video) {
        await supabase
          .from("vb_shoot_queue")
          .update({ status: "failed" })
          .eq("id", queueId);
        results.push({ id: queueId, status: "failed", error: "Item not found" });
        continue;
      }

      const video = item.viral_video;

      const prompt = `你是一位專業的短影音導演和編劇。請根據以下爆款影片資訊，生成一個「致敬翻拍」的逐秒腳本。

## 原始爆款影片資訊
- 標題：${video.title || "（無標題）"}
- 平台：${video.platform}
- 點讚數：${video.likes}
- 播放數：${video.plays}
- 分享數：${video.shares}
- 作者：${video.author_name || "未知"}
- Hashtags：${(video.hashtags || []).join(", ") || "無"}

## 要求
1. 生成 JSON 格式的逐秒腳本
2. 每個片段包含：timecode（時間碼，如 "00:00-00:03"）、scene（畫面描述）、dialogue（台詞/旁白）
3. 總時長控制在 15-60 秒
4. 保留原始影片的爆款元素（節奏、轉折、情緒點）
5. 內容改為健身/筋膜放鬆相關主題
6. 台詞要口語化、有感染力

請直接輸出 JSON 陣列，不要加其他說明文字：
[
  {"timecode": "00:00-00:03", "scene": "畫面描述", "dialogue": "台詞"},
  ...
]`;

      const raw = await callGemini(prompt);
      const timecodes = parseTimecodes(raw);

      if (timecodes.length === 0) {
        await supabase
          .from("vb_shoot_queue")
          .update({
            status: "failed",
            script_raw: raw,
          })
          .eq("id", queueId);
        results.push({ id: queueId, status: "failed", error: "Failed to parse timecodes" });
        continue;
      }

      // 寫回結果
      await supabase
        .from("vb_shoot_queue")
        .update({
          status: "completed",
          script_timecodes: timecodes,
          script_raw: raw,
          script_generated_at: new Date().toISOString(),
        })
        .eq("id", queueId);

      results.push({ id: queueId, status: "completed" });
    } catch (err: any) {
      await supabase
        .from("vb_shoot_queue")
        .update({
          status: "failed",
          script_raw: err.message || String(err),
        })
        .eq("id", queueId);
      results.push({ id: queueId, status: "failed", error: err.message });
    }
  }

  const completedCount = results.filter((r) => r.status === "completed").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  // Webhook 通知 n8n：腳本生成完畢 → Slack 通知操盤手
  const webhookUrl = process.env.N8N_WEBHOOK_SCRIPT_DONE;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: ids.length,
        completed: completedCount,
        failed: failedCount,
        results,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    results,
    total: ids.length,
    completed: completedCount,
    failed: failedCount,
  });
}
