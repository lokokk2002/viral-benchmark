import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// lazy proxy — helper functions 在 module level 引用 supabase
const supabase = new Proxy({} as ReturnType<typeof getSupabaseServer>, {
  get: (_target, prop) => (getSupabaseServer() as any)[prop],
});

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
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// =============================================
// ① 對標帳號建議：從爆款中找高頻優質作者
// =============================================
interface AccountSuggestion {
  author_id: string;
  author_name: string;
  platform: string;
  video_count: number;
  total_likes: number;
  avg_likes: number;
  sample_title: string;
}

async function suggestAccounts(projectId: string): Promise<AccountSuggestion[]> {
  const { data: videos } = await supabase
    .from("vb_viral_videos")
    .select("author_id, author_name, platform, likes, title")
    .eq("project_id", projectId)
    .order("discovered_at", { ascending: false })
    .limit(500);

  if (!videos || videos.length === 0) return [];

  // 統計每個作者的數據
  const authorMap: Record<string, {
    author_name: string;
    platform: string;
    count: number;
    totalLikes: number;
    sampleTitle: string;
  }> = {};

  for (const v of videos) {
    if (!v.author_id) continue;
    const key = `${v.platform}:${v.author_id}`;
    if (!authorMap[key]) {
      authorMap[key] = {
        author_name: v.author_name || v.author_id,
        platform: v.platform,
        count: 0,
        totalLikes: 0,
        sampleTitle: v.title || "",
      };
    }
    authorMap[key].count++;
    authorMap[key].totalLikes += v.likes || 0;
  }

  // 排除已追蹤的帳號
  const { data: existing } = await supabase
    .from("vb_tracked_accounts")
    .select("account_id, platform")
    .eq("project_id", projectId);
  const existingSet = new Set(
    (existing || []).map((a: any) => `${a.platform}:${a.account_id}`)
  );

  // 排序：出現次數 × 平均點讚，取 top 15
  return Object.entries(authorMap)
    .filter(([key]) => !existingSet.has(key))
    .filter(([, v]) => v.count >= 2) // 至少出現 2 次
    .map(([, v]) => ({
      author_id: v.platform === "douyin" ? v.author_name : v.author_name,
      author_name: v.author_name,
      platform: v.platform,
      video_count: v.count,
      total_likes: v.totalLikes,
      avg_likes: Math.round(v.totalLikes / v.count),
      sample_title: v.sampleTitle,
    }))
    .sort((a, b) => b.video_count * b.avg_likes - a.video_count * a.avg_likes)
    .slice(0, 15);
}

// =============================================
// ② 人群賽道建議：用 Gemini 分析累積數據
// =============================================
interface AudienceSuggestion {
  group_name: string;
  group_icon: string;
  tracks: {
    name: string;
    icon: string;
    keywords: string[];
  }[];
}

async function suggestAudience(projectId: string): Promise<AudienceSuggestion[]> {
  // 收集素材：hashtags + keywords + video titles
  const [videosRes, keywordsRes, groupsRes] = await Promise.all([
    supabase
      .from("vb_viral_videos")
      .select("title, hashtags, platform")
      .eq("project_id", projectId)
      .order("likes", { ascending: false })
      .limit(200),
    supabase
      .from("vb_keywords")
      .select("keyword")
      .eq("project_id", projectId)
      .eq("is_active", true),
    supabase
      .from("vb_audience_groups")
      .select("name")
      .eq("project_id", projectId),
  ]);

  const videos = videosRes.data || [];
  const keywords = (keywordsRes.data || []).map((k: any) => k.keyword);
  const existingGroups = (groupsRes.data || []).map((g: any) => g.name);

  if (videos.length === 0 && keywords.length === 0) {
    return [];
  }

  // 收集所有 hashtag
  const allHashtags: string[] = [];
  const allTitles: string[] = [];
  for (const v of videos) {
    if (v.hashtags) allHashtags.push(...v.hashtags);
    if (v.title) allTitles.push(v.title);
  }

  const topHashtags = [...new Set(allHashtags)].slice(0, 50);
  const sampleTitles = allTitles.slice(0, 30);

  const prompt = `你是一位短影音行銷策略專家。請根據以下累積的爆款數據，建議「受眾人群」和「內容賽道」分類。

## 品牌背景
這是一個健身/筋膜放鬆品牌的短影音帳號。

## 已有的關鍵字
${keywords.join("、") || "（尚無）"}

## 爆款影片常見 Hashtag（前 50）
${topHashtags.join("、") || "（尚無）"}

## 爆款影片標題範例（前 30）
${sampleTitles.join("\n") || "（尚無）"}

## 已建立的人群（避免重複）
${existingGroups.join("、") || "（尚無）"}

## 要求
1. 建議 3-5 個受眾人群分類（不要跟已建立的重複）
2. 每個人群下建議 2-4 個內容賽道
3. 每個賽道附帶 3-5 個建議搜尋關鍵字
4. 人群和賽道都要有 emoji 圖示

請直接輸出 JSON 陣列，不要加其他說明：
[
  {
    "group_name": "人群名稱",
    "group_icon": "emoji",
    "tracks": [
      { "name": "賽道名稱", "icon": "emoji", "keywords": ["關鍵字1", "關鍵字2"] }
    ]
  }
]`;

  const raw = await callGemini(prompt);

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // parse failed
  }

  return [];
}

// =============================================
// POST /api/ai-suggest
// =============================================
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { project_id, type } = body;

  if (!project_id || !type) {
    return NextResponse.json(
      { error: "project_id and type required" },
      { status: 400 }
    );
  }

  try {
    if (type === "accounts") {
      const accounts = await suggestAccounts(project_id);
      return NextResponse.json({ accounts });
    }

    if (type === "audience") {
      const audience = await suggestAudience(project_id);
      return NextResponse.json({ audience });
    }

    return NextResponse.json(
      { error: `Unknown type: ${type}` },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "AI suggest failed" },
      { status: 500 }
    );
  }
}
