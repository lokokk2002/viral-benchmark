import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.5-flash";

async function callGemini(prompt: string, temperature = 0.5): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 8192,
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

interface TimecodeEntry {
  timecode: string;
  scene: string;
  dialogue: string;
  note?: string;
}

function parseTimecodes(raw: string): TimecodeEntry[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  const results: TimecodeEntry[] = [];

  // 嘗試解析 JSON 格式（優先）
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          timecode: item.timecode || item.time || "",
          scene: item.scene || item.visual || item.description || "",
          dialogue: item.dialogue || item.script || item.text || "",
          note: item.note || item.remark || "",
        }));
      }
    }
  } catch {
    // JSON 解析失敗，嘗試清理後重試
    try {
      // 有時 LLM 會用 markdown code block 包裝
      const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        const cleaned = codeBlockMatch[1].trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => ({
            timecode: item.timecode || item.time || "",
            scene: item.scene || item.visual || item.description || "",
            dialogue: item.dialogue || item.script || item.text || "",
            note: item.note || item.remark || "",
          }));
        }
      }
    } catch {
      // fallback to line parsing
    }
  }

  // Fallback: 解析 markdown 表格或文字格式
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
  try {
  const supabase = getSupabaseServer();
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

      // 組裝影片描述文案（盡量完整）
      const videoDesc = video.title || "（無描述）";
      const hashtagStr = (video.hashtags || []).join(" #") || "無";
      const videoUrl = video.video_url || "";

      const prompt = `你是一位短影音逐字稿還原專家與翻拍腳本編劇。

## 任務
根據以下爆款影片的「完整文案描述」與相關資訊，執行兩件事：

### 第一步：還原原始影片的逐秒腳本
仔細閱讀影片的描述文案，分析其中的敘事結構、情緒轉折、節奏安排，推斷原始影片從頭到尾的內容流程。
你要盡可能忠實還原「原始影片中每一秒實際發生的事」，包括：
- 開場 hook（前 3 秒如何吸引注意力）
- 中段的內容推進
- 結尾的 call to action 或情緒收束
- 畫面中可能出現的文字、動作、場景切換

### 第二步：改編為「倍速集團」品牌翻拍腳本
在保持原始影片的「結構骨架」和「爆款節奏」不變的前提下，將內容改編為適合「倍速集團」（健身器材/筋膜放鬆品牌）的翻拍版本。

---

## 原始爆款影片資訊
- 影片文案：${videoDesc}
- 平台：${video.platform}
- 影片連結：${videoUrl}
- 點讚：${(video.likes || 0).toLocaleString()}
- 播放：${(video.plays || 0).toLocaleString()}
- 分享：${(video.shares || 0).toLocaleString()}
- 作者：${video.author_name || "未知"}
- Hashtags：#${hashtagStr}

---

## 輸出要求
1. **必須使用繁體中文**
2. 輸出 JSON 陣列，每個元素包含以下欄位：
   - \`timecode\`: 時間碼，格式 "00:00-00:03"
   - \`scene\`: 畫面描述（攝影角度、場景、人物動作、畫面文字）
   - \`dialogue\`: 口播台詞或旁白（口語化、有感染力的繁體中文）
   - \`note\`: 拍攝備註（原始影片這段在做什麼、為什麼這樣設計）
3. 時間碼要連續，從 00:00 開始
4. 總時長根據原始影片類型合理推估（短影音通常 15-60 秒）
5. 每 2-5 秒為一個片段
6. 台詞必須是「可以直接照著唸」的完整口播稿，不是摘要
7. scene 欄位要具體到拍攝能直接參考的程度（鏡頭遠近、人物動作、場景佈置）

直接輸出 JSON 陣列，不要用 markdown code block，不要加其他說明文字：
[
  {"timecode": "00:00-00:03", "scene": "畫面描述", "dialogue": "台詞", "note": "備註"},
  ...
]`;

      const raw = await callGemini(prompt, 0.4);
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Generate script failed" },
      { status: 500 }
    );
  }
}
