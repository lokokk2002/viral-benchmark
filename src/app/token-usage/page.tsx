"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Loader2,
  RefreshCw,
  Calendar,
} from "lucide-react";

interface DailyRecord {
  date: string;
  calls: number;
  cost: number;
  sources: Record<string, number>;
}

interface EndpointRecord {
  endpoint: string;
  calls: number;
  percentage: number;
}

interface UsageData {
  period: string;
  summary: {
    total_calls: number;
    total_cost_usd: number;
    scan_log_cost_usd: number;
  };
  comparison: {
    calls_change_pct: number;
    cost_change_pct: number;
    prev_total_calls: number;
    prev_total_cost_usd: number;
  };
  daily: DailyRecord[];
  endpoints: EndpointRecord[];
}

const SOURCE_LABELS: Record<string, string> = {
  scan: "掃描",
  keyword_suggest: "關鍵字建議",
  unknown: "其他",
};

export default function TokenUsagePage() {
  const [period, setPeriod] = useState<"this_month" | "last_month">(
    "this_month"
  );
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/token-usage?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "載入失敗");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const formatCost = (n: number) => `$${n.toFixed(4)}`;
  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      {/* 標題列 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="text-purple-500" size={28} />
          <h1 className="text-2xl font-bold text-gray-900">
            API Token 用量總覽
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPeriod("this_month")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === "this_month"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Calendar size={14} className="inline mr-1.5 -mt-0.5" />
            本月
          </button>
          <button
            onClick={() => setPeriod("last_month")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === "last_month"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Calendar size={14} className="inline mr-1.5 -mt-0.5" />
            上月
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            title="重新載入"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={24} />
          載入中...
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-600 rounded-xl p-4 mb-6">
          {error}
        </div>
      )}

      {!loading && data && (
        <>
          {/* 摘要卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {/* API 呼叫數 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                <BarChart3 size={16} />
                API 呼叫次數
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {formatNumber(data.summary.total_calls)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                上期：{formatNumber(data.comparison.prev_total_calls)}
              </div>
            </div>

            {/* 花費 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                <DollarSign size={16} />
                花費 (USD)
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {formatCost(data.summary.total_cost_usd)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                上期：{formatCost(data.comparison.prev_total_cost_usd)}
              </div>
            </div>

            {/* 較上期 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                {data.comparison.cost_change_pct >= 0 ? (
                  <TrendingUp size={16} className="text-red-500" />
                ) : (
                  <TrendingDown size={16} className="text-green-500" />
                )}
                較上期變化
              </div>
              <div
                className={`text-3xl font-bold ${
                  data.comparison.cost_change_pct >= 0
                    ? "text-red-600"
                    : "text-green-600"
                }`}
              >
                {data.comparison.cost_change_pct >= 0 ? "+" : ""}
                {data.comparison.cost_change_pct}%
              </div>
              <div className="text-xs text-gray-400 mt-1">
                呼叫數變化：
                {data.comparison.calls_change_pct >= 0 ? "+" : ""}
                {data.comparison.calls_change_pct}%
              </div>
            </div>
          </div>

          {/* 端點用量分布 */}
          {data.endpoints.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                端點用量分布
              </h2>
              <div className="space-y-3">
                {data.endpoints.map((ep) => (
                  <div key={ep.endpoint}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700 font-mono text-xs truncate max-w-[60%]">
                        {ep.endpoint}
                      </span>
                      <span className="text-gray-500 shrink-0 ml-2">
                        {formatNumber(ep.calls)} 次 ({ep.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className="bg-purple-500 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(ep.percentage, 1)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 每日明細 */}
          {data.daily.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  每日明細
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">日期</th>
                      <th className="text-right px-5 py-3 font-medium">
                        呼叫數
                      </th>
                      <th className="text-right px-5 py-3 font-medium">
                        花費 (USD)
                      </th>
                      <th className="text-left px-5 py-3 font-medium">
                        來源
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.daily.map((d) => (
                      <tr key={d.date} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-900 font-medium">
                          {d.date}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">
                          {formatNumber(d.calls)}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">
                          {formatCost(d.cost)}
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          {Object.entries(d.sources)
                            .map(
                              ([src, count]) =>
                                `${SOURCE_LABELS[src] || src}: ${count}`
                            )
                            .join("、")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-medium">
                    <tr>
                      <td className="px-5 py-3 text-gray-900">合計</td>
                      <td className="px-5 py-3 text-right text-gray-900">
                        {formatNumber(data.summary.total_calls)}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-900">
                        {formatCost(data.summary.total_cost_usd)}
                      </td>
                      <td className="px-5 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 shadow-sm">
              <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg">
                {period === "this_month"
                  ? "本月尚無 API 呼叫記錄"
                  : "上月尚無 API 呼叫記錄"}
              </p>
              <p className="text-sm mt-1">
                執行掃描或使用熱搜建議後，用量資料會顯示在這裡
              </p>
            </div>
          )}

          {/* 計費說明 */}
          <div className="mt-6 bg-gray-50 rounded-xl p-4 text-xs text-gray-400">
            <p>
              * 費用依 TikHub API 計費標準估算：每次 API 呼叫 $0.001 USD
            </p>
            <p className="mt-1">
              * 僅計算成功回應的 API 呼叫，失敗或逾時的不計入
            </p>
          </div>
        </>
      )}
    </div>
  );
}
