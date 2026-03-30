import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/migrate
 * 自動建立缺少的資料表（冪等操作，可重複呼叫）
 * 需要先在 Supabase SQL Editor 建立 helper function（一次性）
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServer();
  const results: string[] = [];

  // 檢查 api_usage_logs 表是否存在
  const { error: testErr } = await supabase
    .from("vb_api_usage_logs")
    .select("id")
    .limit(1);

  if (testErr && testErr.message?.includes("vb_api_usage_logs")) {
    results.push("❌ vb_api_usage_logs 表不存在");
    results.push("請到 Supabase Dashboard → SQL Editor 執行以下 SQL：");
    results.push(`
CREATE TABLE IF NOT EXISTS viral_benchmark.api_usage_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source text NOT NULL,
  project_id uuid REFERENCES viral_benchmark.projects(id),
  endpoint text NOT NULL,
  api_calls int NOT NULL DEFAULT 1,
  cost_usd numeric(8,4) NOT NULL DEFAULT 0.0010,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_created
  ON viral_benchmark.api_usage_logs(created_at);

CREATE OR REPLACE VIEW viral_benchmark.vb_api_usage_logs
  AS SELECT * FROM viral_benchmark.api_usage_logs;

GRANT SELECT, INSERT ON viral_benchmark.api_usage_logs TO anon, authenticated;
GRANT SELECT ON viral_benchmark.vb_api_usage_logs TO anon, authenticated;
    `.trim());
  } else {
    results.push("✅ vb_api_usage_logs 表已存在");
  }

  // 檢查 env vars
  const envChecks = [
    { key: "APP_PASSWORD", exists: !!process.env.APP_PASSWORD },
    { key: "SESSION_SECRET", exists: !!process.env.SESSION_SECRET },
    { key: "TIKHUB_API_KEY", exists: !!process.env.TIKHUB_API_KEY },
  ];

  for (const { key, exists } of envChecks) {
    results.push(exists ? `✅ ${key} 已設定` : `❌ ${key} 未設定`);
  }

  return NextResponse.json({ results });
}
