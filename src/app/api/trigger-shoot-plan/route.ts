import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

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
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

interface ShootPlanContent {
  locations: { name: string; videos: string[] }[];
  costumes: { video_title: string; items: string[] }[];
  equipment: string[];
  shoot_order: { order: number; video_title: string; location: string }[];
}

function parsePlanContent(raw: string): ShootPlanContent | null {
  try {
    // 清理 markdown code block 包裝
    let cleaned = raw;
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    // 嘗試提取 JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // 只要有 locations 或 shoot_order 就視為有效
      if (parsed.locations || parsed.shoot_order) {
        return {
          locations: Array.isArray(parsed.locations)
            ? parsed.locations.map((loc: any) =>
                typeof loc === "string"
                  ? { name: loc, videos: [] }
                  : { name: loc.name || "", videos: loc.videos || [] }
              )
            : [],
          costumes: Array.isArray(parsed.costumes) ? parsed.costumes : [],
          equipment: Array.isArray(parsed.equipment) ? parsed.equipment : [],
          shoot_order: Array.isArray(parsed.shoot_order)
            ? parsed.shoot_order.map((s: any, i: number) => ({
                order: s.order ?? i + 1,
                video_title: s.video_title || s.title || "",
                location: s.location || "",
              }))
            : [],
        };
      }
    }
  } catch {
    // fallback
  }
  return null;
}

// =============================================
// POST /api/trigger-shoot-plan
// 1. 查 vb_shoot_queue 已完成腳本
// 2. Gemini 彙整拍攝計畫
// 3. 寫入 vb_shoot_plans
// 4. 通知 n8n → Slack
// =============================================
export async function POST(request: NextRequest) {
  try {
  const supabase = getSupabaseServer();
  const body = await request.json();
  const { project_id, shoot_week } = body;

  if (!project_id || !shoot_week) {
    return NextResponse.json(
      { error: "project_id and shoot_week required" },
      { status: 400 }
    );
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Step 1: 查詢已完成腳本的 shoot_queue items
  const { data: queueItems, error: queueErr } = await supabase
    .from("vb_shoot_queue")
    .select("*, viral_video:vb_viral_videos(*)")
    .eq("project_id", project_id)
    .eq("shoot_week", shoot_week)
    .eq("status", "completed")
    .order("created_at", { ascending: true });

  if (queueErr) {
    return NextResponse.json(
      { error: `DB error: ${queueErr.message}` },
      { status: 500 }
    );
  }

  if (!queueItems || queueItems.length === 0) {
    return NextResponse.json(
      { error: "本週沒有已完成腳本，無法生成拍攝計畫" },
      { status: 400 }
    );
  }

  // Step 2: 組裝 Gemini prompt
  const videoSummaries = queueItems
    .map((item: any, idx: number) => {
      const v = item.viral_video;
      // 精簡標題：取前 20 字
      const shortTitle = (v?.title || "無標題").slice(0, 20);
      const timecodes = item.script_timecodes || [];
      const scriptPreview = timecodes
        .slice(0, 2)
        .map((tc: any) => `  ${tc.timecode}: ${tc.scene}`)
        .join("\n");

      return `### 影片 ${idx + 1}：${shortTitle}
- 平台：${v?.platform || "未知"}
- 腳本片段：
${scriptPreview || "  （無腳本資料）"}`;
    })
    .join("\n\n");

  const prompt = `你是一位專業的短影音拍攝製片，負責規劃本週的拍攝計畫。

## 本週已確認的翻拍腳本（共 ${queueItems.length} 支）

${videoSummaries}

## 請根據以上影片生成拍攝計畫，以 JSON 格式輸出，包含以下結構：

{
  "locations": [
    { "name": "地點名稱", "videos": ["影片1標題", "影片2標題"] }
  ],
  "costumes": [
    { "video_title": "影片標題", "items": ["服裝1", "服裝2"] }
  ],
  "equipment": ["設備1", "設備2", "設備3"],
  "shoot_order": [
    { "order": 1, "video_title": "影片標題", "location": "拍攝地點" }
  ]
}

## 要求
1. locations：按場景歸類，同地點的影片合併
2. costumes：每支影片需要的服裝/造型
3. equipment：所有影片拍攝需要的共用設備清單
4. shoot_order：建議拍攝順序，按地點動線最佳化（同地點連拍）
5. video_title 請用精簡的中文短標題（10字以內），不要用原始的完整標題
6. 直接輸出 JSON，不要用 markdown code block 包裝，不要加其他說明文字`;

  let planContent: ShootPlanContent | null = null;
  let planRaw: string = "";

  try {
    planRaw = await callGemini(prompt);
    planContent = parsePlanContent(planRaw);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Gemini 生成失敗：${err.message}` },
      { status: 502 }
    );
  }

  // Step 3: 寫入 vb_shoot_plans
  const { data: plan, error: insertErr } = await supabase
    .from("vb_shoot_plans")
    .insert({
      project_id,
      shoot_week,
      plan_content: planContent,
      plan_raw: planRaw,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: `寫入失敗：${insertErr.message}` },
      { status: 500 }
    );
  }

  // Step 4: 通知 n8n → Slack
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_SHOOT_PLAN;
  if (n8nWebhookUrl) {
    fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id,
        shoot_week,
        plan_id: plan?.id,
        video_count: queueItems.length,
        has_structured_content: !!planContent,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    plan_id: plan?.id,
    video_count: queueItems.length,
    has_structured_content: !!planContent,
  });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Trigger shoot plan failed" },
      { status: 500 }
    );
  }
}
