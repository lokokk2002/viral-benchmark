import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TIKHUB_BASE = process.env.TIKHUB_API_BASE_URL || "https://api.tikhub.io";
const TIKHUB_KEY = process.env.TIKHUB_API_KEY || "";

async function tikhubGet(path: string, params: Record<string, string>) {
  const url = new URL(`${TIKHUB_BASE}${path}`);
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
  return json.data;
}

interface Suggestion {
  keyword: string;
  source: string;
  occurrences?: number;
}

// ① 從爆款反推：分析 viral_videos 的標題和 hashtag
async function suggestFromContent(projectId: string): Promise<Suggestion[]> {
  const { data: videos } = await supabase
    .from("vb_viral_videos")
    .select("title, hashtags")
    .eq("project_id", projectId)
    .order("discovered_at", { ascending: false })
    .limit(100);

  if (!videos || videos.length === 0) {
    return [{ keyword: "（尚無爆款資料，請先執行掃描）", source: "提示", occurrences: 0 }];
  }

  // 統計 hashtag 出現次數
  const freq: Record<string, number> = {};
  for (const v of videos) {
    const tags: string[] = v.hashtags || [];
    for (const tag of tags) {
      const clean = tag.replace(/^#/, "").trim();
      if (clean && clean.length > 1) {
        freq[clean] = (freq[clean] || 0) + 1;
      }
    }
    // 也分析標題中的關鍵詞（簡單切詞）
    const title: string = v.title || "";
    const words = title.match(/[\u4e00-\u9fff]{2,6}/g) || [];
    for (const w of words) {
      if (w.length >= 2) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }
  }

  // 排除已追蹤的關鍵字
  const { data: existing } = await supabase
    .from("vb_keywords")
    .select("keyword")
    .eq("project_id", projectId);
  const existingSet = new Set((existing || []).map((k: any) => k.keyword));

  return Object.entries(freq)
    .filter(([kw]) => !existingSet.has(kw))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([kw, count]) => ({
      keyword: kw,
      source: "爆款反推",
      occurrences: count,
    }));
}

// ② 對標帳號趨勢：分析 tracked_accounts 的近期影片主題
async function suggestFromAccounts(projectId: string): Promise<Suggestion[]> {
  const { data: accounts } = await supabase
    .from("vb_tracked_accounts")
    .select("account_name, platform")
    .eq("project_id", projectId)
    .eq("is_active", true);

  if (!accounts || accounts.length === 0) {
    return [{ keyword: "（尚無對標帳號，請先到掃描設定新增）", source: "提示", occurrences: 0 }];
  }

  // 分析該專案 source_type=account 的爆款
  const { data: videos } = await supabase
    .from("vb_viral_videos")
    .select("title, hashtags")
    .eq("project_id", projectId)
    .eq("source_type", "account")
    .order("discovered_at", { ascending: false })
    .limit(50);

  if (!videos || videos.length === 0) {
    // 如果還沒有帳號掃描資料，從所有爆款中取
    return suggestFromContent(projectId);
  }

  const freq: Record<string, number> = {};
  for (const v of videos) {
    const tags: string[] = v.hashtags || [];
    for (const tag of tags) {
      const clean = tag.replace(/^#/, "").trim();
      if (clean && clean.length > 1) freq[clean] = (freq[clean] || 0) + 1;
    }
  }

  const { data: existing } = await supabase
    .from("vb_keywords")
    .select("keyword")
    .eq("project_id", projectId);
  const existingSet = new Set((existing || []).map((k: any) => k.keyword));

  return Object.entries(freq)
    .filter(([kw]) => !existingSet.has(kw))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([kw, count]) => ({
      keyword: kw,
      source: "帳號趨勢",
      occurrences: count,
    }));
}

// ③ 自家 IG 數據（目前無 IG 資料，回傳提示）
async function suggestFromInstagram(): Promise<Suggestion[]> {
  return [
    { keyword: "（IG 數據尚未整合，待 Phase 2 串接）", source: "IG 數據", occurrences: 0 },
  ];
}

// ④ 熱搜榜：呼叫 TikHub 抖音熱搜
async function suggestFromTrending(projectId: string): Promise<Suggestion[]> {
  const { data: project } = await supabase
    .from("vb_projects")
    .select("platforms")
    .eq("id", projectId)
    .single();

  const platforms: string[] = project?.platforms || [];
  const suggestions: Suggestion[] = [];

  if (platforms.includes("douyin")) {
    const data = await tikhubGet(
      "/api/v1/douyin/web/fetch_hot_search_result",
      {}
    );
    if (data) {
      const list = data?.data?.word_list || data?.word_list || [];
      for (const item of list.slice(0, 20)) {
        const word = item?.word || item?.query || "";
        if (word) {
          suggestions.push({
            keyword: word,
            source: "抖音熱搜",
            occurrences: item?.hot_value || item?.view_count || 0,
          });
        }
      }
    }
  }

  if (platforms.includes("tiktok")) {
    const data = await tikhubGet(
      "/api/v1/tiktok/web/fetch_trending_searchwords",
      {}
    );
    if (data) {
      const list = data?.data || [];
      for (const item of list.slice(0, 15)) {
        const word = item?.keyword || item?.word || "";
        if (word) {
          suggestions.push({
            keyword: word,
            source: "TikTok 熱搜",
            occurrences: 0,
          });
        }
      }
    }
  }

  if (suggestions.length === 0) {
    suggestions.push({
      keyword: "（熱搜 API 暫無回傳，請稍後再試）",
      source: "提示",
      occurrences: 0,
    });
  }

  return suggestions;
}

// ⑤ 人群擴展：從 audience_tracks.suggested_keywords 生成
async function suggestFromAudience(
  projectId: string,
  audienceGroupId?: string,
  audienceTrackId?: string
): Promise<Suggestion[]> {
  if (audienceTrackId) {
    const { data: track } = await supabase
      .from("vb_audience_tracks")
      .select("name, suggested_keywords")
      .eq("id", audienceTrackId)
      .single();
    if (track) {
      return (track.suggested_keywords || []).map((kw: string) => ({
        keyword: kw,
        source: `人群擴展 / ${track.name}`,
      }));
    }
  }

  if (audienceGroupId) {
    const { data: tracks } = await supabase
      .from("vb_audience_tracks")
      .select("name, suggested_keywords")
      .eq("audience_group_id", audienceGroupId)
      .eq("is_active", true);
    const suggestions: Suggestion[] = [];
    for (const track of tracks || []) {
      for (const kw of track.suggested_keywords || []) {
        suggestions.push({ keyword: kw, source: `人群擴展 / ${track.name}` });
      }
    }
    return suggestions;
  }

  // 全部人群
  const { data: groups } = await supabase
    .from("vb_audience_groups")
    .select("id, name")
    .eq("project_id", projectId)
    .eq("is_active", true);

  if (!groups || groups.length === 0) {
    return [
      { keyword: "（尚無人群資料，請先到掃描設定建立人群與賽道）", source: "提示", occurrences: 0 },
    ];
  }

  const suggestions: Suggestion[] = [];
  for (const group of groups) {
    const { data: tracks } = await supabase
      .from("vb_audience_tracks")
      .select("name, suggested_keywords")
      .eq("audience_group_id", group.id)
      .eq("is_active", true);
    for (const track of tracks || []) {
      for (const kw of track.suggested_keywords || []) {
        suggestions.push({
          keyword: kw,
          source: `${group.name} / ${track.name}`,
        });
      }
    }
  }
  return suggestions.length > 0
    ? suggestions
    : [{ keyword: "（人群賽道尚無建議關鍵字）", source: "提示", occurrences: 0 }];
}

// =============================================
// POST /api/keyword-suggest
// =============================================
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { project_id, suggest_type, audience_group_id, audience_track_id } =
    body;

  if (!project_id || !suggest_type) {
    return NextResponse.json(
      { error: "project_id and suggest_type required" },
      { status: 400 }
    );
  }

  let suggestions: Suggestion[] = [];

  switch (suggest_type) {
    case "content":
      suggestions = await suggestFromContent(project_id);
      break;
    case "account":
      suggestions = await suggestFromAccounts(project_id);
      break;
    case "instagram":
      suggestions = await suggestFromInstagram();
      break;
    case "trending":
      suggestions = await suggestFromTrending(project_id);
      break;
    case "audience":
      suggestions = await suggestFromAudience(
        project_id,
        audience_group_id,
        audience_track_id
      );
      break;
    default:
      return NextResponse.json(
        { error: `Unknown suggest_type: ${suggest_type}` },
        { status: 400 }
      );
  }

  return NextResponse.json({ suggestions });
}
