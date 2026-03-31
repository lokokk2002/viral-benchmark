import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_GENERATE_SCRIPT || "";

// =============================================
// POST /api/generate-script
// 輕量觸發器：標記 status = generating → 逐支呼叫 n8n webhook
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
      .select("id, viral_video:vb_viral_videos(platform, video_id, video_url, title, author_name)")
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

    // 逐支呼叫 n8n webhook（每支獨立一個 webhook 請求）
    // n8n 每次只收到 1 個 item，避免同時處理多支影片互相搶資源
    console.log(`[generate-script] 準備逐支發送 ${items.length} 支到 n8n`);

    let sentCount = 0;
    for (let i = 0; i < items.length; i++) {
      const item: any = items[i];
      const singlePayload = {
        items: [{
          queue_item_id: item.id,
          platform: item.viral_video?.platform || "",
          video_id: item.viral_video?.video_id || "",
          video_url: item.viral_video?.video_url || "",
          title: item.viral_video?.title || "",
          author_name: item.viral_video?.author_name || "",
        }],
      };

      try {
        const n8nRes = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(singlePayload),
        });
        console.log(`[generate-script] 第 ${i + 1}/${items.length} 支送出, n8n: ${n8nRes.status}`);
        sentCount++;
      } catch (err: any) {
        console.error(`[generate-script] 第 ${i + 1} 支發送失敗:`, err.message);
      }

      // 每支之間間隔 2 秒，讓 n8n 有時間開始處理前一支
      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    return NextResponse.json({
      queued: true,
      count: items.length,
      sent: sentCount,
      message: `已逐支觸發 ${sentCount}/${items.length} 支影片的逐字稿生成，請稍候。`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Generate script trigger failed" },
      { status: 500 }
    );
  }
}
