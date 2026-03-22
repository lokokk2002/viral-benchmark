-- =============================================
-- 爆款對標系統 — Supabase Schema
-- Schema: viral_benchmark
-- =============================================

CREATE SCHEMA IF NOT EXISTS viral_benchmark;

-- 啟用 uuid 擴充
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 2.1 projects — 專案表
-- =============================================
CREATE TABLE viral_benchmark.projects (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  platforms     text[] NOT NULL DEFAULT '{}',
  weekly_kpi    integer DEFAULT 100,
  slack_channel_id text,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

COMMENT ON TABLE viral_benchmark.projects IS '每個品牌/市場一個專案';

-- =============================================
-- 2.2 keywords — 關鍵字表
-- =============================================
CREATE TABLE viral_benchmark.keywords (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    uuid NOT NULL REFERENCES viral_benchmark.projects(id) ON DELETE CASCADE,
  keyword       text NOT NULL,
  platforms     text[] DEFAULT '{}',
  source        text DEFAULT 'manual',
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

COMMENT ON TABLE viral_benchmark.keywords IS '操盤手定義的核心關鍵字 + AI 建議擴展關鍵字';
CREATE INDEX idx_keywords_project ON viral_benchmark.keywords(project_id);

-- =============================================
-- 2.3 tracked_accounts — 對標帳號表
-- =============================================
CREATE TABLE viral_benchmark.tracked_accounts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    uuid NOT NULL REFERENCES viral_benchmark.projects(id) ON DELETE CASCADE,
  platform      text NOT NULL,
  account_id    text NOT NULL,
  account_name  text,
  account_url   text,
  source        text DEFAULT 'manual',
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

COMMENT ON TABLE viral_benchmark.tracked_accounts IS '固定追蹤的對標帳號';
CREATE INDEX idx_tracked_accounts_project ON viral_benchmark.tracked_accounts(project_id);

-- =============================================
-- 2.4 thresholds — 爆款門檻表
-- =============================================
CREATE TABLE viral_benchmark.thresholds (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    uuid NOT NULL REFERENCES viral_benchmark.projects(id) ON DELETE CASCADE,
  platform      text NOT NULL,
  min_likes     integer DEFAULT 10000,
  min_shares    integer DEFAULT 0,
  max_days_old  integer DEFAULT 30,
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(project_id, platform)
);

COMMENT ON TABLE viral_benchmark.thresholds IS '每個專案、每個平台的爆款判定門檻';

-- =============================================
-- 2.5 audience_groups — 人群表
-- =============================================
CREATE TABLE viral_benchmark.audience_groups (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    uuid NOT NULL REFERENCES viral_benchmark.projects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  icon          text,
  is_active     boolean DEFAULT true
);

COMMENT ON TABLE viral_benchmark.audience_groups IS '核心受眾人群';
CREATE INDEX idx_audience_groups_project ON viral_benchmark.audience_groups(project_id);

-- =============================================
-- 2.6 audience_tracks — 人群賽道表
-- =============================================
CREATE TABLE viral_benchmark.audience_tracks (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audience_group_id   uuid NOT NULL REFERENCES viral_benchmark.audience_groups(id) ON DELETE CASCADE,
  name                text NOT NULL,
  icon                text,
  suggested_keywords  text[] DEFAULT '{}',
  is_active           boolean DEFAULT true
);

COMMENT ON TABLE viral_benchmark.audience_tracks IS '每個人群下的跨賽道分類';
CREATE INDEX idx_audience_tracks_group ON viral_benchmark.audience_tracks(audience_group_id);

-- =============================================
-- 2.7 viral_videos — 爆款對標表（核心）
-- =============================================
CREATE TABLE viral_benchmark.viral_videos (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      uuid NOT NULL REFERENCES viral_benchmark.projects(id) ON DELETE CASCADE,
  platform        text NOT NULL,
  video_id        text NOT NULL,
  video_url       text,
  title           text,
  author_name     text,
  author_id       text,
  likes           integer DEFAULT 0,
  comments        integer DEFAULT 0,
  shares          integer DEFAULT 0,
  plays           bigint DEFAULT 0,
  published_at    timestamptz,
  discovered_at   timestamptz DEFAULT now(),
  source_type     text,
  source_keyword  text,
  hashtags        text[] DEFAULT '{}',
  thumbnail_url   text,
  scan_batch_id   uuid,
  UNIQUE(project_id, platform, video_id)
);

COMMENT ON TABLE viral_benchmark.viral_videos IS '所有掃描到的爆款影片';
CREATE INDEX idx_viral_videos_project ON viral_benchmark.viral_videos(project_id);
CREATE INDEX idx_viral_videos_discovered ON viral_benchmark.viral_videos(discovered_at DESC);

-- =============================================
-- 2.8 shoot_queue — 本週拍攝表
-- =============================================
CREATE TABLE viral_benchmark.shoot_queue (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            uuid NOT NULL REFERENCES viral_benchmark.projects(id) ON DELETE CASCADE,
  viral_video_id        uuid NOT NULL REFERENCES viral_benchmark.viral_videos(id) ON DELETE CASCADE,
  status                text DEFAULT 'pending',
  script_timecodes      jsonb,
  script_raw            text,
  shoot_week            text,
  added_by              text,
  created_at            timestamptz DEFAULT now(),
  script_generated_at   timestamptz
);

COMMENT ON TABLE viral_benchmark.shoot_queue IS '操盤手勾選的本週拍攝影片';
CREATE INDEX idx_shoot_queue_project ON viral_benchmark.shoot_queue(project_id);
CREATE INDEX idx_shoot_queue_week ON viral_benchmark.shoot_queue(shoot_week);

-- =============================================
-- 2.9 shoot_plans — 拍攝計畫表
-- =============================================
CREATE TABLE viral_benchmark.shoot_plans (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    uuid NOT NULL REFERENCES viral_benchmark.projects(id) ON DELETE CASCADE,
  shoot_week    text,
  plan_content  jsonb,
  plan_raw      text,
  pdf_url       text,
  status        text DEFAULT 'draft',
  created_at    timestamptz DEFAULT now()
);

COMMENT ON TABLE viral_benchmark.shoot_plans IS 'Claude API 彙整的拍攝計畫';
CREATE INDEX idx_shoot_plans_project ON viral_benchmark.shoot_plans(project_id);

-- =============================================
-- 2.10 scan_logs — 掃描日誌表
-- =============================================
CREATE TABLE viral_benchmark.scan_logs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          uuid NOT NULL REFERENCES viral_benchmark.projects(id) ON DELETE CASCADE,
  batch_id            uuid,
  trigger_type        text,
  total_raw           integer DEFAULT 0,
  total_after_dedup   integer DEFAULT 0,
  total_after_filter  integer DEFAULT 0,
  supplement_layers   text[] DEFAULT '{}',
  kpi_target          integer,
  kpi_met             boolean DEFAULT false,
  api_cost_usd        numeric(8,4) DEFAULT 0,
  started_at          timestamptz DEFAULT now(),
  completed_at        timestamptz,
  error_log           text
);

COMMENT ON TABLE viral_benchmark.scan_logs IS '每次掃描的執行紀錄';
CREATE INDEX idx_scan_logs_project ON viral_benchmark.scan_logs(project_id);

-- =============================================
-- 種子資料：三個品牌專案
-- =============================================
INSERT INTO viral_benchmark.projects (name, slug, platforms, weekly_kpi) VALUES
  ('倍速運動', 'beisu', ARRAY['douyin','xiaohongshu'], 100),
  ('放筋鬆 ReChill', 'rechill', ARRAY['douyin','xiaohongshu'], 100),
  ('ReChill Malaysia', 'rechill-my', ARRAY['tiktok'], 100);

-- 為每個專案建立預設門檻
INSERT INTO viral_benchmark.thresholds (project_id, platform, min_likes, min_shares, max_days_old)
SELECT p.id, unnest(p.platforms), 10000, 0, 30
FROM viral_benchmark.projects p;

-- =============================================
-- updated_at 自動更新觸發器
-- =============================================
CREATE OR REPLACE FUNCTION viral_benchmark.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON viral_benchmark.projects
  FOR EACH ROW EXECUTE FUNCTION viral_benchmark.update_updated_at();

CREATE TRIGGER trg_thresholds_updated_at
  BEFORE UPDATE ON viral_benchmark.thresholds
  FOR EACH ROW EXECUTE FUNCTION viral_benchmark.update_updated_at();
