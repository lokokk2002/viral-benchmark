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
          maxOutputTokens: 16384,
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

// v2: 新的拍攝計畫結構 — 以每支影片為核心
interface ShootPlanVideo {
  order: number;
  short_title: string;
  original_title: string;
  location: string;
  location_detail: string;
  costumes: string[];
  props: string[];
  key_shots: string[];
  duration_estimate: string;
  notes: string;
}

interface ShootPlanContent {
  videos: ShootPlanVideo[];
  locations: { name: string; videos: string[] }[];
  equipment: string[];
  total_duration_estimate: string;
  general_notes: string;
  // 保留舊欄位相容
  costumes?: { video_title: string; items: string[] }[];
  shoot_order?: { order: number; video_title: string; location: string }[];
}

function parsePlanContent(raw: string): ShootPlanContent | null {
  try {
    let cleaned = raw;
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // v2: 有 videos 欄位
      if (parsed.videos && Array.isArray(parsed.videos)) {
        return {
          videos: parsed.videos.map((v: any, i: number) => ({
            order: v.order ?? i + 1,
            short_title: v.short_title || v.video_title || "",
            original_title: v.original_title || "",
            location: v.location || "",
            location_detail: v.location_detail || "",
            costumes: Array.isArray(v.costumes) ? v.costumes : [],
            props: Array.isArray(v.props) ? v.props : [],
            key_shots: Array.isArray(v.key_shots) ? v.key_shots : [],
            duration_estimate: v.duration_estimate || "",
            notes: v.notes || "",
          })),
          locations: Array.isArray(parsed.locations)
            ? parsed.locations.map((loc: any) =>
                typeof loc === "string"
                  ? { name: loc, videos: [] }
                  : { name: loc.name || "", videos: loc.videos || [] }
              )
            : [],
          equipment: Array.isArray(parsed.equipment) ? parsed.equipment : [],
          total_duration_estimate: parsed.total_duration_estimate || "",
          general_notes: parsed.general_notes || "",
          // 相容舊欄位
          costumes: parsed.videos.map((v: any) => ({
            video_title: v.short_title || v.video_title || "",
            items: Array.isArray(v.costumes) ? v.costumes : [],
          })),
          shoot_order: parsed.videos.map((v: any, i: number) => ({
            order: v.order ?? i + 1,
            video_title: v.short_title || v.video_title || "",
            location: v.location || "",
          })),
        };
      }
      // v1 fallback: 舊格式
      if (parsed.locations || parsed.shoot_order) {
        return {
          videos: [],
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
          total_duration_estimate: "",
          general_notes: "",
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
// 2. Gemini 彙整拍攝計畫（v2: 以影片為核心）
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

  // Step 2: 組裝 Gemini prompt（v2: 更完整的影片資訊）
  console.log(`[shoot-plan] 開始處理 ${queueItems.length} 支已完成腳本`);

  const videoSummaries = queueItems
    .map((item: any, idx: number) => {
      const v = item.viral_video;
      const shortTitle = (v?.title || "無標題").slice(0, 40);
      const timecodes = item.script_timecodes || [];

      console.log(`[shoot-plan] 影片 ${idx + 1}: ${shortTitle}, timecodes: ${timecodes.length} 段`);

      const scriptContent = timecodes.length > 0
        ? timecodes
            .map((tc: any) => `  ${tc.timecode}: [畫面] ${tc.scene}${tc.dialogue ? ` [台詞] ${tc.dialogue}` : ""}${tc.note ? ` [備註] ${tc.note}` : ""}`)
            .join("\n")
        : "  （無腳本資料）";

      return `### 影片 ${idx + 1}：${shortTitle}
- 平台：${v?.platform || "未知"}
- 作者：${v?.author_name || "未知"}
- 完整逐字稿：
${scriptContent}`;
    })
    .join("\n\n");

  const prompt = `你是一位專業的短影音拍攝製片，負責規劃本週的拍攝計畫。
我們團隊要「翻拍」以下爆款影片，請根據每支影片的逐字稿內容，規劃完整的拍攝計畫。

## 本週已確認的翻拍腳本（共 ${queueItems.length} 支）

${videoSummaries}

## 請以 JSON 格式輸出，結構如下：

{
  "videos": [
    {
      "order": 1,
      "short_title": "精簡中文標題（10字內）",
      "original_title": "原始影片完整標題",
      "location": "建議拍攝場景/地點",
      "location_detail": "場景佈置細節：需要什麼背景、擺設等",
      "costumes": ["服裝1", "服裝2"],
      "props": ["道具1", "道具2"],
      "key_shots": ["重點鏡頭描述1", "重點鏡頭描述2", "重點鏡頭描述3"],
      "duration_estimate": "預估拍攝時間",
      "notes": "拍攝注意事項"
    }
  ],
  "locations": [
    { "name": "地點名稱", "videos": ["影片短標題1", "影片短標題2"] }
  ],
  "equipment": ["設備1", "設備2"],
  "total_duration_estimate": "總預估拍攝時間",
  "general_notes": "整體拍攝注意事項"
}

## 嚴格要求
1. **videos 是最重要的部分**！每支影片都必須有完整的拍攝指引
2. **key_shots**：根據逐字稿中的場景描述，提取 3-5 個最重要的鏡頭/畫面，告訴攝影師要怎麼拍
3. **location_detail**：不只說「客廳」，要說「客廳的瑜伽墊區域，需要乾淨的背景」之類的具體描述
4. **costumes**：根據逐字稿畫面描述中出現的穿著來分析
5. **props**：根據逐字稿中出現的道具來列出
6. **order**：按地點動線最佳化排序（同地點的影片連續拍攝，減少場地轉換）
7. **original_title**：填入每支影片的原始完整標題
8. 必須使用繁體中文輸出
9. 直接輸出 JSON，不要用 markdown code block 包裝`;

  let planContent: ShootPlanContent | null = null;
  let planRaw: string = "";

  try {
    console.log(`[shoot-plan] 呼叫 Gemini，prompt 長度: ${prompt.length} 字`);
    planRaw = await callGemini(prompt);
    console.log(`[shoot-plan] Gemini 回傳長度: ${planRaw.length} 字`);
    planContent = parsePlanContent(planRaw);
    console.log(`[shoot-plan] 結構化解析: ${planContent ? "成功" : "失敗（使用 raw fallback）"}`);
  } catch (err: any) {
    console.error(`[shoot-plan] Gemini 錯誤:`, err.message);
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
    try {
      await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id,
          shoot_week,
          plan_id: plan?.id,
          video_count: queueItems.length,
          has_structured_content: !!planContent,
          page_url: "https://viral-benchmark.zeabur.app/shoot-plan",
        }),
      });
    } catch (e: any) {
      console.error("[shoot-plan] Slack 通知失敗:", e.message);
    }
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
