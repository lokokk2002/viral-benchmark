import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TIKHUB_BASE = process.env.TIKHUB_API_BASE_URL || "https://api.tikhub.io";
const TIKHUB_KEY = process.env.TIKHUB_API_KEY || "";

// =============================================
// TikHub API 呼叫
// =============================================
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

// =============================================
// 平台搜尋解析器
// =============================================
interface RawVideo {
  platform: string;
  video_id: string;
  video_url: string;
  title: string;
  author_name: string;
  author_id: string;
  likes: number;
  comments: number;
  shares: number;
  plays: number;
  published_at: string | null;
  hashtags: string[];
  thumbnail_url: string;
  source_type: string;
  source_keyword: string;
}

function parseDouyinResults(
  data: any,
  keyword: string,
  sourceType: string
): RawVideo[] {
  const items = data?.business_data || data?.data || [];
  const results: RawVideo[] = [];

  for (const item of items) {
    const aweme = item?.data?.aweme_info || item?.aweme_info || item;
    if (!aweme?.aweme_id) continue;

    const stats = aweme.statistics || {};
    const author = aweme.author || {};
    const textExtra = aweme.text_extra || [];
    const hashtags = textExtra
      .filter((t: any) => t.hashtag_name)
      .map((t: any) => t.hashtag_name);
    const cover =
      aweme.video?.cover?.url_list?.[0] ||
      aweme.video?.dynamic_cover?.url_list?.[0] ||
      "";

    results.push({
      platform: "douyin",
      video_id: aweme.aweme_id,
      video_url: aweme.share_url || `https://www.douyin.com/video/${aweme.aweme_id}`,
      title: aweme.desc || "",
      author_name: author.nickname || "",
      author_id: author.uid || author.sec_uid || "",
      likes: stats.digg_count || 0,
      comments: stats.comment_count || 0,
      shares: stats.share_count || 0,
      plays: stats.play_count || 0,
      published_at: aweme.create_time
        ? new Date(aweme.create_time * 1000).toISOString()
        : null,
      hashtags,
      thumbnail_url: cover,
      source_type: sourceType,
      source_keyword: keyword,
    });
  }
  return results;
}

function parseDouyinUserPosts(
  data: any,
  accountName: string
): RawVideo[] {
  const items = data?.aweme_list || data?.business_data?.aweme_list || [];
  const results: RawVideo[] = [];

  for (const aweme of items) {
    if (!aweme?.aweme_id) continue;

    const stats = aweme.statistics || {};
    const author = aweme.author || {};
    const textExtra = aweme.text_extra || [];
    const hashtags = textExtra
      .filter((t: any) => t.hashtag_name)
      .map((t: any) => t.hashtag_name);
    const cover =
      aweme.video?.cover?.url_list?.[0] ||
      aweme.video?.dynamic_cover?.url_list?.[0] ||
      "";

    results.push({
      platform: "douyin",
      video_id: aweme.aweme_id,
      video_url: aweme.share_url || `https://www.douyin.com/video/${aweme.aweme_id}`,
      title: aweme.desc || "",
      author_name: author.nickname || accountName,
      author_id: author.uid || author.sec_uid || "",
      likes: stats.digg_count || 0,
      comments: stats.comment_count || 0,
      shares: stats.share_count || 0,
      plays: stats.play_count || 0,
      published_at: aweme.create_time
        ? new Date(aweme.create_time * 1000).toISOString()
        : null,
      hashtags,
      thumbnail_url: cover,
      source_type: "account",
      source_keyword: accountName,
    });
  }
  return results;
}

function parseXiaohongshuResults(
  data: any,
  keyword: string,
  sourceType: string
): RawVideo[] {
  const items = data?.data?.items || [];
  const results: RawVideo[] = [];

  for (const item of items) {
    const note = item?.note;
    if (!note?.id) continue;

    const user = note.user || {};
    const images = note.images_list || [];
    const cover = images[0]?.url || "";

    const hashtagRegex = /#([^\s#]+)/g;
    const hashtags: string[] = [];
    let match;
    const desc = note.desc || "";
    while ((match = hashtagRegex.exec(desc)) !== null) {
      hashtags.push(match[1]);
    }

    results.push({
      platform: "xiaohongshu",
      video_id: note.id,
      video_url: `https://www.xiaohongshu.com/explore/${note.id}`,
      title: note.display_title || desc.slice(0, 60) || "",
      author_name: user.nickname || "",
      author_id: user.userid || "",
      likes: note.liked_count || 0,
      comments: 0,
      shares: note.shared_count || 0,
      plays: 0,
      published_at: note.timestamp
        ? new Date(note.timestamp * 1000).toISOString()
        : null,
      hashtags,
      thumbnail_url: cover,
      source_type: sourceType,
      source_keyword: keyword,
    });
  }
  return results;
}

function parseXiaohongshuUserPosts(
  data: any,
  accountName: string
): RawVideo[] {
  const notes = data?.data?.notes || data?.notes || [];
  const results: RawVideo[] = [];

  for (const note of notes) {
    if (!note?.note_id && !note?.id) continue;
    const noteId = note.note_id || note.id;

    const user = note.user || {};
    const cover = note.cover?.url || note.images_list?.[0]?.url || "";
    const desc = note.desc || note.display_title || "";

    const hashtagRegex = /#([^\s#]+)/g;
    const hashtags: string[] = [];
    let match;
    while ((match = hashtagRegex.exec(desc)) !== null) {
      hashtags.push(match[1]);
    }

    results.push({
      platform: "xiaohongshu",
      video_id: noteId,
      video_url: `https://www.xiaohongshu.com/explore/${noteId}`,
      title: note.display_title || desc.slice(0, 60) || "",
      author_name: user.nickname || accountName,
      author_id: user.userid || "",
      likes: note.liked_count || note.interact_info?.liked_count || 0,
      comments: note.comment_count || 0,
      shares: note.shared_count || 0,
      plays: 0,
      published_at: note.timestamp
        ? new Date(note.timestamp * 1000).toISOString()
        : null,
      hashtags,
      thumbnail_url: cover,
      source_type: "account",
      source_keyword: accountName,
    });
  }
  return results;
}

function parseTiktokResults(
  data: any,
  keyword: string,
  sourceType: string
): RawVideo[] {
  const items = data?.aweme_list || [];
  const results: RawVideo[] = [];

  for (const aweme of items) {
    if (!aweme?.aweme_id) continue;

    const stats = aweme.statistics || {};
    const author = aweme.author || {};
    const textExtra = aweme.text_extra || [];
    const hashtags = textExtra
      .filter((t: any) => t.hashtag_name)
      .map((t: any) => t.hashtag_name);
    const cover =
      aweme.video?.cover?.url_list?.[0] ||
      aweme.video?.dynamic_cover?.url_list?.[0] ||
      "";

    results.push({
      platform: "tiktok",
      video_id: aweme.aweme_id,
      video_url: `https://www.tiktok.com/@${author.unique_id || "user"}/video/${aweme.aweme_id}`,
      title: aweme.desc || "",
      author_name: author.nickname || "",
      author_id: author.uid || author.sec_uid || "",
      likes: stats.digg_count || 0,
      comments: stats.comment_count || 0,
      shares: stats.share_count || 0,
      plays: stats.play_count || 0,
      published_at: aweme.create_time
        ? new Date(aweme.create_time * 1000).toISOString()
        : null,
      hashtags,
      thumbnail_url: cover,
      source_type: sourceType,
      source_keyword: keyword,
    });
  }
  return results;
}

function parseTiktokUserPosts(
  data: any,
  accountName: string
): RawVideo[] {
  const items = data?.aweme_list || [];
  const results: RawVideo[] = [];

  for (const aweme of items) {
    if (!aweme?.aweme_id) continue;

    const stats = aweme.statistics || {};
    const author = aweme.author || {};
    const textExtra = aweme.text_extra || [];
    const hashtags = textExtra
      .filter((t: any) => t.hashtag_name)
      .map((t: any) => t.hashtag_name);
    const cover =
      aweme.video?.cover?.url_list?.[0] ||
      aweme.video?.dynamic_cover?.url_list?.[0] ||
      "";

    results.push({
      platform: "tiktok",
      video_id: aweme.aweme_id,
      video_url: `https://www.tiktok.com/@${author.unique_id || "user"}/video/${aweme.aweme_id}`,
      title: aweme.desc || "",
      author_name: author.nickname || accountName,
      author_id: author.uid || author.sec_uid || "",
      likes: stats.digg_count || 0,
      comments: stats.comment_count || 0,
      shares: stats.share_count || 0,
      plays: stats.play_count || 0,
      published_at: aweme.create_time
        ? new Date(aweme.create_time * 1000).toISOString()
        : null,
      hashtags,
      thumbnail_url: cover,
      source_type: "account",
      source_keyword: accountName,
    });
  }
  return results;
}

// =============================================
// 平台搜尋函式
// =============================================
async function searchDouyin(
  keyword: string,
  count: number,
  sourceType: string
): Promise<RawVideo[]> {
  const data = await tikhubGet(
    "/api/v1/douyin/app/v3/fetch_video_search_result_v2",
    { keyword, count: String(count), offset: "0" }
  );
  return data ? parseDouyinResults(data, keyword, sourceType) : [];
}

async function searchXiaohongshu(
  keyword: string,
  count: number,
  sourceType: string
): Promise<RawVideo[]> {
  const data = await tikhubGet("/api/v1/xiaohongshu/app/search_notes", {
    keyword,
    page: "1",
  });
  const results = data
    ? parseXiaohongshuResults(data, keyword, sourceType)
    : [];
  return results.slice(0, count);
}

async function searchTiktok(
  keyword: string,
  count: number,
  sourceType: string
): Promise<RawVideo[]> {
  const data = await tikhubGet(
    "/api/v1/tiktok/app/v3/fetch_video_search_result",
    { keyword, count: String(count) }
  );
  return data ? parseTiktokResults(data, keyword, sourceType) : [];
}

const SEARCH_FN: Record<
  string,
  (kw: string, count: number, src: string) => Promise<RawVideo[]>
> = {
  douyin: searchDouyin,
  xiaohongshu: searchXiaohongshu,
  tiktok: searchTiktok,
};

// =============================================
// 帳號監控函式
// =============================================
async function fetchDouyinUserPosts(
  accountId: string,
  accountName: string,
  count: number
): Promise<RawVideo[]> {
  // 嘗試用 sec_user_id 抓取
  const data = await tikhubGet(
    "/api/v1/douyin/app/v3/fetch_user_post_videos",
    { sec_user_id: accountId, count: String(count), max_cursor: "0" }
  );
  return data ? parseDouyinUserPosts(data, accountName) : [];
}

async function fetchXiaohongshuUserPosts(
  accountId: string,
  accountName: string
): Promise<RawVideo[]> {
  const data = await tikhubGet(
    "/api/v1/xiaohongshu/app/get_user_notes",
    { user_id: accountId, cursor: "" }
  );
  return data ? parseXiaohongshuUserPosts(data, accountName) : [];
}

async function fetchTiktokUserPosts(
  accountId: string,
  accountName: string,
  count: number
): Promise<RawVideo[]> {
  const data = await tikhubGet(
    "/api/v1/tiktok/app/v3/fetch_user_post_videos",
    { sec_user_id: accountId, count: String(count), max_cursor: "0" }
  );
  return data ? parseTiktokUserPosts(data, accountName) : [];
}

const ACCOUNT_FN: Record<
  string,
  (id: string, name: string, count: number) => Promise<RawVideo[]>
> = {
  douyin: fetchDouyinUserPosts,
  xiaohongshu: (id, name) => fetchXiaohongshuUserPosts(id, name),
  tiktok: fetchTiktokUserPosts,
};

// =============================================
// 門檻過濾
// =============================================
interface ThresholdConfig {
  min_likes: number;
  min_shares: number;
  min_comments: number;
  max_days_old: number;
}

function filterByThreshold(
  videos: RawVideo[],
  thresholdMap: Record<string, ThresholdConfig>,
  likesMultiplier = 1.0
): RawVideo[] {
  const now = Date.now();
  return videos.filter((v) => {
    const th = thresholdMap[v.platform];
    if (!th) return true;

    const effectiveMinLikes = Math.floor(th.min_likes * likesMultiplier);
    if (v.likes < effectiveMinLikes) return false;
    if (th.min_shares > 0 && v.shares < th.min_shares) return false;
    if (th.min_comments > 0 && v.comments < th.min_comments) return false;

    if (v.published_at) {
      const daysOld =
        (now - new Date(v.published_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysOld > th.max_days_old) return false;
    }

    return true;
  });
}

// =============================================
// POST /api/trigger-scan
// =============================================
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { project_id } = body;

  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const batchId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  let totalRaw = 0;
  let totalDedup = 0;
  let totalFiltered = 0;
  const supplementLayers: string[] = [];

  try {
    // Step 1 — 讀取專案設定
    const [projectRes, keywordsRes, accountsRes, thresholdsRes] =
      await Promise.all([
        supabase.from("vb_projects").select("*").eq("id", project_id).single(),
        supabase
          .from("vb_keywords")
          .select("*")
          .eq("project_id", project_id)
          .eq("is_active", true),
        supabase
          .from("vb_tracked_accounts")
          .select("*")
          .eq("project_id", project_id)
          .eq("is_active", true),
        supabase.from("vb_thresholds").select("*").eq("project_id", project_id),
      ]);

    const project = projectRes.data;
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const keywords = keywordsRes.data || [];
    const accounts = accountsRes.data || [];
    const thresholds = thresholdsRes.data || [];
    const platforms: string[] = project.platforms || [];

    // 建立門檻 map
    const thresholdMap: Record<string, ThresholdConfig> = {};
    for (const th of thresholds) {
      thresholdMap[th.platform] = {
        min_likes: th.min_likes,
        min_shares: th.min_shares,
        min_comments: th.min_comments || 0,
        max_days_old: th.max_days_old,
      };
    }

    // Step 2 — 關鍵字搜尋（並行）
    const searchPromises: Promise<RawVideo[]>[] = [];
    for (const kw of keywords) {
      const kwPlatforms = kw.platforms?.length ? kw.platforms : platforms;
      for (const platform of kwPlatforms) {
        const fn = SEARCH_FN[platform];
        if (fn) {
          searchPromises.push(fn(kw.keyword, 20, "keyword"));
        }
      }
    }

    // Step 3 — 帳號監控（並行）
    const accountPromises: Promise<RawVideo[]>[] = [];
    for (const acc of accounts) {
      const fn = ACCOUNT_FN[acc.platform];
      if (fn) {
        accountPromises.push(
          fn(acc.account_id, acc.account_name || acc.account_id, 20)
        );
      }
    }

    const [searchResults, accountResults] = await Promise.all([
      Promise.all(searchPromises),
      Promise.all(accountPromises),
    ]);

    let allVideos = [...searchResults.flat(), ...accountResults.flat()];
    totalRaw = allVideos.length;

    // Step 4 — 合併去重
    const seen = new Set<string>();
    const unique: RawVideo[] = [];
    for (const v of allVideos) {
      const key = `${v.platform}:${v.video_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(v);
      }
    }

    // 比對 Supabase 已存在的
    const existingRes = await supabase
      .from("vb_viral_videos")
      .select("platform, video_id")
      .eq("project_id", project_id);
    const existingSet = new Set(
      (existingRes.data || []).map(
        (e: any) => `${e.platform}:${e.video_id}`
      )
    );
    const newVideos = unique.filter(
      (v) => !existingSet.has(`${v.platform}:${v.video_id}`)
    );
    totalDedup = newVideos.length;

    // Step 5 — 門檻過濾（正常門檻）
    let filtered = filterByThreshold(newVideos, thresholdMap, 1.0);
    totalFiltered = filtered.length;

    // Step 6 — 補量機制
    if (filtered.length < project.weekly_kpi) {
      // 第一層補量：放寬門檻到 50%
      const relaxed = filterByThreshold(newVideos, thresholdMap, 0.5);
      const relaxedNew = relaxed.filter(
        (v) => !filtered.some((f) => f.platform === v.platform && f.video_id === v.video_id)
      );
      if (relaxedNew.length > 0) {
        filtered = [...filtered, ...relaxedNew];
        supplementLayers.push(`放寬門檻50%：+${relaxedNew.length} 筆`);
      }
    }

    if (filtered.length < project.weekly_kpi) {
      // 第二層補量：放寬門檻到 25%
      const veryRelaxed = filterByThreshold(newVideos, thresholdMap, 0.25);
      const veryRelaxedNew = veryRelaxed.filter(
        (v) => !filtered.some((f) => f.platform === v.platform && f.video_id === v.video_id)
      );
      if (veryRelaxedNew.length > 0) {
        filtered = [...filtered, ...veryRelaxedNew];
        supplementLayers.push(`放寬門檻75%：+${veryRelaxedNew.length} 筆`);
      }
    }

    if (filtered.length < project.weekly_kpi) {
      // 第三層補量：用關鍵字組合擴展搜尋
      const expandPromises: Promise<RawVideo[]>[] = [];
      const keywordTexts = keywords.map((k: any) => k.keyword);
      // 兩兩組合前 5 個關鍵字
      const topKeywords = keywordTexts.slice(0, 5);
      for (let i = 0; i < topKeywords.length; i++) {
        for (let j = i + 1; j < topKeywords.length; j++) {
          const combo = `${topKeywords[i]} ${topKeywords[j]}`;
          for (const platform of platforms) {
            const fn = SEARCH_FN[platform];
            if (fn) {
              expandPromises.push(fn(combo, 10, "ai_expand"));
            }
          }
        }
      }

      if (expandPromises.length > 0) {
        const expandResults = await Promise.all(expandPromises);
        const expandVideos = expandResults.flat();
        // 去重（跟已有的比）
        const expandNew = expandVideos.filter((v) => {
          const key = `${v.platform}:${v.video_id}`;
          if (seen.has(key) || existingSet.has(key)) return false;
          seen.add(key);
          return true;
        });
        // 用放寬 50% 門檻過濾
        const expandFiltered = filterByThreshold(expandNew, thresholdMap, 0.5);
        if (expandFiltered.length > 0) {
          filtered = [...filtered, ...expandFiltered];
          supplementLayers.push(`關鍵字組合擴展：+${expandFiltered.length} 筆`);
        }
      }
    }

    totalFiltered = filtered.length;

    // Step 7 — 寫入 Supabase
    if (filtered.length > 0) {
      const rows = filtered.map((v) => ({
        project_id,
        platform: v.platform,
        video_id: v.video_id,
        video_url: v.video_url,
        title: v.title,
        author_name: v.author_name,
        author_id: v.author_id,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares,
        plays: v.plays,
        published_at: v.published_at,
        discovered_at: new Date().toISOString(),
        source_type: v.source_type,
        source_keyword: v.source_keyword,
        hashtags: v.hashtags,
        thumbnail_url: v.thumbnail_url,
        scan_batch_id: batchId,
      }));

      await supabase
        .from("vb_viral_videos")
        .upsert(rows, {
          onConflict: "project_id,platform,video_id",
          ignoreDuplicates: true,
        });
    }

    // Step 8 — 寫入 scan_logs
    await supabase.from("vb_scan_logs").insert({
      project_id,
      batch_id: batchId,
      trigger_type: "manual",
      total_raw: totalRaw,
      total_after_dedup: totalDedup,
      total_after_filter: totalFiltered,
      supplement_layers: supplementLayers,
      kpi_target: project.weekly_kpi,
      kpi_met: totalFiltered >= project.weekly_kpi,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      summary: {
        total_raw: totalRaw,
        total_after_dedup: totalDedup,
        total_after_filter: totalFiltered,
        supplement_layers: supplementLayers,
        kpi_target: project.weekly_kpi,
        kpi_met: totalFiltered >= project.weekly_kpi,
        keywords_count: keywords.length,
        accounts_count: accounts.length,
        platforms,
      },
    });
  } catch (err: any) {
    await supabase.from("vb_scan_logs").insert({
      project_id,
      batch_id: batchId,
      trigger_type: "manual",
      total_raw: totalRaw,
      total_after_dedup: totalDedup,
      total_after_filter: totalFiltered,
      supplement_layers: supplementLayers,
      kpi_target: 0,
      kpi_met: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error_log: err.message || String(err),
    });

    return NextResponse.json(
      { error: err.message || "Scan failed" },
      { status: 500 }
    );
  }
}
