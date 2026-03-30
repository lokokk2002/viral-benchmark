import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_GENERATE_SCRIPT || "";

// =============================================
// POST /api/generate-script
// 輕量觸發器：標記 status = generating → 呼叫 n8n webhook
// 重工（TikHub 下載 + Gemini 上傳 + 逐字稿生成）全在 n8n 中執行
// =============================================
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = await request.json();
    const ids: string[] =
      body.queue_item_ids ||
      (body.queue_item_id ? [body.queue_item_id] : []);

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "queue_item_id or queue_item_ids required" },
        { status: 400 }
      );
    }

    if (!N8N_WEBHOOK_URL) {
      return NextResponse.json(
        {
          error:
            "N8N_WEBHOOK_GENERATE_SCRIPT 未設定。請在 Zeabur 環境變數中加入此 webhook URL。",
        },
        { status: 500 }
      );
    }

    // 讀取所有 queue items + viral_video 資料
    const { data: items, error: fetchErr } = await supabase
      .from("vb_shoot_queue")
      .select("id, viral_video:vb_viral_videos(platform, video_id, video_url)")
      .in("id", ids);

    if (fetchErr || !items || items.length === 0) {
      return NextResponse.json(
        { error: fetchErr?.message || "找不到指定的佇列項目" },
        { status: 404 }
      );
    }

    // 批次標記 status = "generating"
    const { error: updateErr } = await supabase
      .from("vb_shoot_queue")
      .update({ status: "generating" })
      .in("id", ids);

    if (updateErr) {
      return NextResponse.json(
        { error: `更新狀態失敗: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // 組裝 payload 給 n8n
    const webhookPayload = {
      items: items.map((item: any) => ({
        queue_item_id: item.id,
        platform: item.viral_video?.platform || "",
        video_id: item.viral_video?.video_id || "",
        video_url: item.viral_video?.video_url || "",
      })),
    };

    // Fire-and-forget 呼叫 n8n webhook
    fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    }).catch((err) => {
      console.error("[generate-script] n8n webhook call failed:", err.message);
    });

    return NextResponse.json({
      queued: true,
      count: items.length,
      message: `已觸發 ${items.length} 支影片的逐字稿生成，請稍候。`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Generate script trigger failed" },
      { status: 500 }
    );
  }
}
