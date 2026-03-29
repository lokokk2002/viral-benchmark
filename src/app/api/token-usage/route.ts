import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// GET /api/token-usage?period=this_month|last_month
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "this_month";

  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  if (period === "last_month") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    // this_month
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  // 取得當期資料
  const { data: logs, error } = await supabase
    .from("vb_api_usage_logs")
    .select("*")
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const records = logs || [];

  // 匯總
  const totalCalls = records.reduce((sum, r) => sum + (r.api_calls || 0), 0);
  const totalCost = records.reduce((sum, r) => sum + parseFloat(r.cost_usd || "0"), 0);

  // 每日明細
  const dailyMap: Record<string, { calls: number; cost: number; sources: Record<string, number> }> = {};
  for (const r of records) {
    const day = r.created_at.slice(0, 10); // YYYY-MM-DD
    if (!dailyMap[day]) {
      dailyMap[day] = { calls: 0, cost: 0, sources: {} };
    }
    dailyMap[day].calls += r.api_calls || 0;
    dailyMap[day].cost += parseFloat(r.cost_usd || "0");
    const src = r.source || "unknown";
    dailyMap[day].sources[src] = (dailyMap[day].sources[src] || 0) + (r.api_calls || 0);
  }
  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      calls: d.calls,
      cost: parseFloat(d.cost.toFixed(4)),
      sources: d.sources,
    }));

  // 端點分布
  const endpointMap: Record<string, number> = {};
  for (const r of records) {
    const ep = r.endpoint || "unknown";
    endpointMap[ep] = (endpointMap[ep] || 0) + (r.api_calls || 0);
  }
  const endpoints = Object.entries(endpointMap)
    .sort((a, b) => b[1] - a[1])
    .map(([endpoint, calls]) => ({
      endpoint: endpoint.replace(/^\/api\/v1\//, ""),
      calls,
      percentage: totalCalls > 0 ? parseFloat(((calls / totalCalls) * 100).toFixed(1)) : 0,
    }));

  // 取得比較期（另一個月）資料做對比
  let compStartDate: Date;
  let compEndDate: Date;
  if (period === "last_month") {
    compStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    compEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  } else {
    compStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    compEndDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const { data: compLogs } = await supabase
    .from("vb_api_usage_logs")
    .select("api_calls, cost_usd")
    .gte("created_at", compStartDate.toISOString())
    .lt("created_at", compEndDate.toISOString());

  const compRecords = compLogs || [];
  const compTotalCalls = compRecords.reduce((sum, r) => sum + (r.api_calls || 0), 0);
  const compTotalCost = compRecords.reduce((sum, r) => sum + parseFloat(r.cost_usd || "0"), 0);

  const callsChange = compTotalCalls > 0
    ? parseFloat((((totalCalls - compTotalCalls) / compTotalCalls) * 100).toFixed(1))
    : totalCalls > 0 ? 100 : 0;
  const costChange = compTotalCost > 0
    ? parseFloat((((totalCost - compTotalCost) / compTotalCost) * 100).toFixed(1))
    : totalCost > 0 ? 100 : 0;

  // 同時從 scan_logs 取得補充資料（相容性：即使 api_usage_logs 表還沒建好也能顯示歷史）
  const { data: scanLogs } = await supabase
    .from("vb_scan_logs")
    .select("api_cost_usd, started_at")
    .gte("started_at", startISO)
    .lt("started_at", endISO)
    .gt("api_cost_usd", 0);

  const scanLogCost = (scanLogs || []).reduce((sum, r) => sum + parseFloat(r.api_cost_usd || "0"), 0);

  return NextResponse.json({
    period,
    summary: {
      total_calls: totalCalls,
      total_cost_usd: parseFloat(totalCost.toFixed(4)),
      scan_log_cost_usd: parseFloat(scanLogCost.toFixed(4)),
    },
    comparison: {
      calls_change_pct: callsChange,
      cost_change_pct: costChange,
      prev_total_calls: compTotalCalls,
      prev_total_cost_usd: parseFloat(compTotalCost.toFixed(4)),
    },
    daily,
    endpoints,
  });
}
