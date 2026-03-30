import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.5-flash";
const TIKHUB_BASE = process.env.TIKHUB_API_BASE_URL || "https://api.tikhub.io";
const TIKHUB_KEY = process.env.TIKHUB_API_KEY || "";

// =============================================
// TikHub: 取得影片無水印下載 URL
// =============================================
async function fetchVideoDownloadUrl(
  platform: string,
  videoId: string,
  videoUrl: string
): Promise<string | null> {
  if (!TIKHUB_KEY) return null;

  try {
    let apiPath = "";
    let params: Record<string, string> = {};

    if (platform === "douyin") {
      apiPath = "/api/v1/douyin/app/v3/fetch_one_video";
      params = { aweme_id: videoId };
    } else if (platform === "tiktok") {
      apiPath = "/api/v1/tiktok/app/v3/fetch_one_video";
      params = { aweme_id: videoId };
    } else if (platform === "xiaohongshu") {
      // 小紅書暫不支援影片下載，回傳 null
      return null;
    } else {
      return null;
    }

    const url = new URL(`${TIKHUB_BASE}${apiPath}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${TIKHUB_KEY}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== 200) return null;

    const data = json.data;

    // 抖音：嘗試多個欄位取得無水印影片 URL
    if (platform === "douyin") {
      const aweme = data?.aweme_detail || data;
      const playUrl =
        aweme?.video?.play_addr?.url_list?.[0] ||
        aweme?.video?.play_addr_h264?.url_list?.[0] ||
        aweme?.video?.play_addr_lowbr?.url_list?.[0] ||
        aweme?.video?.download_addr?.url_list?.[0] ||
        null;
      return playUrl;
    }

    // TikTok
    if (platform === "tiktok") {
      const aweme = data?.aweme_detail || data;
      const playUrl =
        aweme?.video?.play_addr?.url_list?.[0] ||
        aweme?.video?.download_addr?.url_list?.[0] ||
        null;
      return playUrl;
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================
// Gemini Files API: 上傳影片
// =============================================
async function uploadVideoToGemini(
  videoBuffer: ArrayBuffer,
  mimeType: string,
  displayName: string
): Promise<string> {
  const numBytes = videoBuffer.byteLength;

  // Step 1: 開始上傳（取得 upload URL）
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(numBytes),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: { display_name: displayName },
      }),
    }
  );

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`Gemini upload start failed: ${startRes.status} ${err}`);
  }

  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("Gemini upload: missing upload URL in response headers");
  }

  // Step 2: 上傳影片資料
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(numBytes),
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Gemini upload finalize failed: ${uploadRes.status} ${err}`);
  }

  const uploadJson = await uploadRes.json();
  const fileUri = uploadJson?.file?.uri;
  if (!fileUri) {
    throw new Error("Gemini upload: missing file URI in response");
  }

  // Step 3: 等待影片處理完成（ACTIVE 狀態）
  const fileName = uploadJson.file.name; // e.g. "files/xxx"
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000)); // 等 3 秒

    const statusRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`
    );
    if (!statusRes.ok) continue;

    const statusJson = await statusRes.json();
    if (statusJson.state === "ACTIVE") {
      return fileUri;
    }
    if (statusJson.state === "FAILED") {
      throw new Error("Gemini file processing failed");
    }
    // 其他狀態（PROCESSING）繼續等待
  }

  throw new Error("Gemini file processing timeout (90s)");
}

// =============================================
// Gemini: 多模態呼叫（影片 + prompt）
// =============================================
async function callGeminiWithVideo(
  fileUri: string,
  mimeType: string,
  prompt: string,
  temperature = 0.2
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                file_data: {
                  mime_type: mimeType,
                  file_uri: fileUri,
                },
              },
              { text: prompt },
            ],
          },
        ],
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
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// =============================================
// Gemini: 純文字呼叫（fallback 用）
// =============================================
async function callGeminiText(
  prompt: string,
  temperature = 0.3
): Promise<string> {
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
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// =============================================
// 下載影片到記憶體
// =============================================
async function downloadVideo(
  url: string
): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.douyin.com/",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "video/mp4";
    const buffer = await res.arrayBuffer();

    // 基本檢查：至少 10KB 才算有效影片
    if (buffer.byteLength < 10240) return null;

    return {
      buffer,
      mimeType: contentType.includes("video") ? contentType : "video/mp4",
    };
  } catch {
    return null;
  }
}

// =============================================
// 解析 Gemini 回傳的 JSON 逐字稿
// =============================================
interface TimecodeEntry {
  timecode: string;
  scene: string;
  dialogue: string;
  note?: string;
}

function parseTimecodes(raw: string): TimecodeEntry[] {
  // 嘗試解析 JSON 格式（優先）
  const attempts = [
    // 嘗試 1: 直接找 JSON array
    () => {
      const match = raw.match(/\[[\s\S]*\]/);
      return match ? JSON.parse(match[0]) : null;
    },
    // 嘗試 2: 從 code block 中提取
    () => {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      return match ? JSON.parse(match[1].trim()) : null;
    },
  ];

  for (const attempt of attempts) {
    try {
      const parsed = attempt();
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => ({
          timecode: item.timecode || item.time || "",
          scene: item.scene || item.visual || item.description || "",
          dialogue: item.dialogue || item.script || item.text || "",
          note: item.note || item.remark || "",
        }));
      }
    } catch {
      // 繼續下一個嘗試
    }
  }

  // Fallback: 逐行解析
  const lines = raw.split("\n").filter((l) => l.trim());
  const results: TimecodeEntry[] = [];

  for (const line of lines) {
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
// 1:1 逐字稿 Prompt（影片多模態用）
// =============================================
const VIDEO_TRANSCRIPT_PROMPT = `你是一位專業的影片逐字稿轉錄員。

## 任務
請仔細觀看並聆聽這支影片，產出 **1:1 完全還原** 的逐字稿。

## 嚴格要求
1. **dialogue 欄位必須是影片中實際說出的每一句話**，一字不漏、一字不改、不要潤飾、不要改寫、不要摘要
2. 如果影片中有背景音樂但沒有人說話，dialogue 填「（無對話）」
3. 如果影片中有畫面文字（字卡、字幕），在 scene 中完整記錄
4. scene 欄位描述你「實際看到的畫面」，不是你推測的
5. note 欄位記錄該片段的拍攝手法或特殊效果（轉場、濾鏡、特效文字等）
6. **必須使用繁體中文輸出**（即使原始影片是簡體中文或其他語言，也要轉為繁體中文）
7. 時間碼必須精準對應影片的實際時間軸

## 輸出格式
直接輸出 JSON 陣列，不要用 markdown code block 包裝，不要加任何說明文字：
[
  {
    "timecode": "00:00-00:03",
    "scene": "實際看到的畫面描述",
    "dialogue": "影片中實際說出的原話（繁體中文）",
    "note": "拍攝手法備註"
  }
]`;

// =============================================
// Fallback Prompt（沒有影片時，純文字推斷）
// =============================================
function buildFallbackPrompt(video: any): string {
  const videoDesc = video.title || "（無描述）";
  const hashtagStr = (video.hashtags || []).join(" #") || "無";

  return `你是一位專業的短影音分析專家。

## 任務
我無法取得以下影片的原始檔案。請根據影片的文案描述和相關資訊，**盡可能推斷並還原**這支影片的逐秒內容。

⚠️ 重要：因為你沒有看到實際影片，請在每個片段的 note 欄位標註「⚠️ AI 推斷，非實際影片內容」。

## 影片資訊
- 文案：${videoDesc}
- 平台：${video.platform}
- 影片連結：${video.video_url || "無"}
- 點讚：${(video.likes || 0).toLocaleString()}
- 播放：${(video.plays || 0).toLocaleString()}
- 作者：${video.author_name || "未知"}
- Hashtags：#${hashtagStr}

## 輸出要求
1. **必須使用繁體中文**
2. dialogue 欄位寫你推斷影片中可能說的話
3. scene 欄位寫你推斷的畫面內容
4. note 欄位標註「⚠️ AI 推斷」
5. 每 2-5 秒一個片段

直接輸出 JSON 陣列，不要用 markdown code block：
[
  {"timecode": "00:00-00:03", "scene": "畫面描述", "dialogue": "推斷的對話", "note": "⚠️ AI 推斷，非實際影片內容"}
]`;
}

// =============================================
// POST /api/generate-script
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

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const results: {
      id: string;
      status: string;
      method?: string;
      error?: string;
    }[] = [];

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
          results.push({
            id: queueId,
            status: "failed",
            error: "Item not found",
          });
          continue;
        }

        const video = item.viral_video;
        let raw = "";
        let method = "fallback"; // 追蹤使用了哪種方式

        // === 嘗試影片多模態方式 ===
        const downloadUrl = await fetchVideoDownloadUrl(
          video.platform,
          video.video_id,
          video.video_url || ""
        );

        if (downloadUrl) {
          const videoData = await downloadVideo(downloadUrl);

          if (videoData) {
            try {
              const fileUri = await uploadVideoToGemini(
                videoData.buffer,
                videoData.mimeType,
                `viral_${video.platform}_${video.video_id}`
              );

              raw = await callGeminiWithVideo(
                fileUri,
                videoData.mimeType,
                VIDEO_TRANSCRIPT_PROMPT,
                0.2
              );
              method = "video";
            } catch (uploadErr: any) {
              // 影片上傳或處理失敗，fallback 到純文字
              console.error(
                `Video upload failed for ${video.video_id}: ${uploadErr.message}`
              );
            }
          }
        }

        // === Fallback: 純文字推斷 ===
        if (!raw) {
          raw = await callGeminiText(buildFallbackPrompt(video), 0.3);
          method = "fallback";
        }

        const timecodes = parseTimecodes(raw);

        if (timecodes.length === 0) {
          await supabase
            .from("vb_shoot_queue")
            .update({
              status: "failed",
              script_raw: raw,
            })
            .eq("id", queueId);
          results.push({
            id: queueId,
            status: "failed",
            error: "Failed to parse timecodes",
          });
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

        results.push({ id: queueId, status: "completed", method });
      } catch (err: any) {
        await supabase
          .from("vb_shoot_queue")
          .update({
            status: "failed",
            script_raw: err.message || String(err),
          })
          .eq("id", queueId);
        results.push({
          id: queueId,
          status: "failed",
          error: err.message,
        });
      }
    }

    const completedCount = results.filter(
      (r) => r.status === "completed"
    ).length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    // Webhook 通知
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
