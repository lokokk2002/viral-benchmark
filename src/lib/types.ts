// =============================================
// 爆款對標系統 — TypeScript 型別
// =============================================

export interface Project {
  id: string;
  name: string;
  slug: string;
  platforms: Platform[];
  weekly_kpi: number;
  slack_channel_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Platform = "douyin" | "xiaohongshu" | "tiktok";

export interface Keyword {
  id: string;
  project_id: string;
  keyword: string;
  platforms: Platform[];
  source: KeywordSource;
  is_active: boolean;
  created_at: string;
}

export type KeywordSource =
  | "manual"
  | "ai_content"
  | "ai_audience"
  | "ai_account"
  | "ai_trending";

export interface TrackedAccount {
  id: string;
  project_id: string;
  platform: Platform;
  account_id: string;
  account_name: string | null;
  account_url: string | null;
  source: "manual" | "ai_suggested";
  is_active: boolean;
  created_at: string;
}

export interface Threshold {
  id: string;
  project_id: string;
  platform: Platform;
  min_likes: number;
  min_shares: number;
  min_comments: number;
  max_days_old: number;
  updated_at: string;
}

export interface AudienceGroup {
  id: string;
  project_id: string;
  name: string;
  icon: string | null;
  is_active: boolean;
}

export interface AudienceTrack {
  id: string;
  audience_group_id: string;
  name: string;
  icon: string | null;
  suggested_keywords: string[];
  is_active: boolean;
}

export interface ViralVideo {
  id: string;
  project_id: string;
  platform: Platform;
  video_id: string;
  video_url: string | null;
  title: string | null;
  author_name: string | null;
  author_id: string | null;
  likes: number;
  comments: number;
  shares: number;
  plays: number;
  published_at: string | null;
  discovered_at: string;
  source_type: SourceType;
  source_keyword: string | null;
  hashtags: string[];
  thumbnail_url: string | null;
  scan_batch_id: string | null;
}

export type SourceType =
  | "keyword"
  | "account"
  | "ai_expand"
  | "audience_expand";

export interface ShootQueueItem {
  id: string;
  project_id: string;
  viral_video_id: string;
  status: ScriptStatus;
  script_timecodes: ScriptTimecode[] | null;
  script_raw: string | null;
  shoot_week: string | null;
  added_by: string | null;
  created_at: string;
  script_generated_at: string | null;
  // joined
  viral_video?: ViralVideo;
}

export type ScriptStatus = "pending" | "generating" | "completed" | "failed";

export interface ScriptTimecode {
  timecode: string;
  scene: string;
  dialogue: string;
}

export interface ShootPlan {
  id: string;
  project_id: string;
  shoot_week: string | null;
  plan_content: ShootPlanContent | null;
  plan_raw: string | null;
  pdf_url: string | null;
  status: "draft" | "confirmed";
  created_at: string;
}

export interface ShootPlanContent {
  locations: { name: string; videos: string[] }[];
  costumes: { video_title: string; items: string[] }[];
  equipment: string[];
  shoot_order: { order: number; video_title: string; location: string }[];
}

export interface ScanLog {
  id: string;
  project_id: string;
  batch_id: string | null;
  trigger_type: "scheduled" | "manual";
  total_raw: number;
  total_after_dedup: number;
  total_after_filter: number;
  supplement_layers: string[];
  kpi_target: number;
  kpi_met: boolean;
  api_cost_usd: number;
  started_at: string;
  completed_at: string | null;
  error_log: string | null;
}

export interface ApiUsageLog {
  id: string;
  source: "scan" | "keyword_suggest";
  project_id: string;
  endpoint: string;
  api_calls: number;
  cost_usd: number;
  created_at: string;
}

// 前端 UI 用
export interface KeywordSuggestion {
  keyword: string;
  source: string;
  relevance_score?: number;
  occurrences?: number;
  related_data?: string;
}
