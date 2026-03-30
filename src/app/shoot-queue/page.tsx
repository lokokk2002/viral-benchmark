"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { supabase } from "@/lib/supabase";
import { ShootQueueItem, ScriptTimecode } from "@/lib/types";
import { platformIcon, getShootWeek } from "@/lib/utils";
import {
  Film,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  ClipboardList,
  Sparkles,
  RefreshCw,
  Trash2,
} from "lucide-react";

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Clock; color: string }
> = {
  pending: { label: "等待中", icon: Clock, color: "text-gray-400" },
  generating: {
    label: "生成中",
    icon: Loader2,
    color: "text-warning",
  },
  completed: {
    label: "已完成",
    icon: CheckCircle,
    color: "text-success",
  },
  failed: { label: "失敗", icon: XCircle, color: "text-danger" },
};

export default function ShootQueuePage() {
  const { current } = useProject();
  const [items, setItems] = useState<ShootQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatingScripts, setGeneratingScripts] = useState(false);
  const [generatingOne, setGeneratingOne] = useState<string | null>(null);

  const currentWeek = getShootWeek();

  const loadData = useCallback(async () => {
    if (!current) return;
    setLoading(true);

    const { data } = await supabase
      .from("vb_shoot_queue")
      .select("*, viral_video:vb_viral_videos(*)")
      .eq("project_id", current.id)
      .eq("shoot_week", currentWeek)
      .order("created_at", { ascending: false });

    setItems((data as ShootQueueItem[]) ?? []);
    setLoading(false);
  }, [current, currentWeek]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 自動輪詢：有 generating 狀態時每 5 秒重新載入
  const generatingCount = items.filter((i) => i.status === "generating").length;
  useEffect(() => {
    if (generatingCount === 0) return;
    const interval = setInterval(() => loadData(), 5000);
    return () => clearInterval(interval);
  }, [generatingCount, loadData]);

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const completedCount = items.filter((i) => i.status === "completed").length;
  const canGenerateScripts = pendingCount + failedCount > 0;
  const canGeneratePlan = completedCount > 0;
  const hasGenerating = generatingCount > 0;

  // 批次生成所有待處理的腳本（非同步觸發）
  async function handleGenerateAllScripts() {
    const toGenerate = items.filter(
      (i) => i.status === "pending" || i.status === "failed"
    );
    if (toGenerate.length === 0) return;

    setGeneratingScripts(true);
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queue_item_ids: toGenerate.map((i) => i.id),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      // n8n 會在背景處理，前端透過 polling 自動更新
      await loadData();
    } catch (err: any) {
      alert(`觸發失敗：${err.message}`);
    }
    setGeneratingScripts(false);
  }

  // 單支生成腳本（非同步觸發）
  async function handleGenerateOne(queueId: string) {
    setGeneratingOne(queueId);
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue_item_id: queueId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      // n8n 會在背景處理，前端透過 polling 自動更新
      await loadData();
    } catch (err: any) {
      alert(`觸發失敗：${err.message}`);
    }
    setGeneratingOne(null);
  }

  // 移除項目
  async function handleRemove(queueId: string) {
    await supabase.from("vb_shoot_queue").delete().eq("id", queueId);
    loadData();
  }

  async function handleGeneratePlan() {
    if (!current || !canGeneratePlan) return;
    setGeneratingPlan(true);
    try {
      await fetch("/api/trigger-shoot-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: current.id,
          shoot_week: currentWeek,
        }),
      });
      alert("拍攝計畫生成已觸發，請稍後至「拍攝計畫」頁查看");
    } catch {
      alert("觸發失敗，請確認 n8n 是否已串接");
    }
    setGeneratingPlan(false);
  }

  if (!current) {
    return (
      <div className="p-8 text-center text-gray-400">請先選擇專案</div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">本週拍攝表</h1>
          <p className="text-gray-500 text-sm">
            {currentWeek} — 共 {items.length} 支，
            {completedCount} 支腳本完成
            {generatingCount > 0 && `，${generatingCount} 支生成中`}
            {pendingCount > 0 && `，${pendingCount} 支待生成`}
            {failedCount > 0 && `，${failedCount} 支失敗`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canGenerateScripts && (
            <button
              onClick={handleGenerateAllScripts}
              disabled={generatingScripts || hasGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {generatingScripts || hasGenerating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {hasGenerating
                ? `生成中（${generatingCount} 支處理中）...`
                : generatingScripts
                  ? "觸發中..."
                  : `生成腳本（${pendingCount + failedCount} 支）`}
            </button>
          )}
          <button
            onClick={handleGeneratePlan}
            disabled={!canGeneratePlan || generatingPlan}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generatingPlan ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ClipboardList size={16} />
            )}
            生成拍攝計畫
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="border border-border rounded-xl bg-card-bg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">
            <Loader2 size={20} className="inline animate-spin mr-2" />
            載入中...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Film size={32} className="inline mb-2 opacity-50" />
            <p>本週尚無拍攝項目</p>
            <p className="text-xs mt-1">
              請先到「爆款對標表」勾選影片
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              const video = item.viral_video;
              const statusCfg =
                STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;
              const isExpanded = expandedId === item.id;
              const isGeneratingThis = generatingOne === item.id;

              return (
                <div key={item.id}>
                  <div
                    className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span>
                      {video
                        ? platformIcon(video.platform)
                        : "📱"}
                    </span>
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : item.id)
                      }
                    >
                      <p className="text-sm font-medium truncate">
                        {video?.title || "（無標題）"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {video?.author_name || "-"}
                      </p>
                    </div>

                    <span
                      className={`flex items-center gap-1 text-xs ${statusCfg.color}`}
                    >
                      <StatusIcon
                        size={14}
                        className={
                          item.status === "generating"
                            ? "animate-spin"
                            : ""
                        }
                      />
                      {statusCfg.label}
                    </span>

                    {/* 單支操作按鈕 */}
                    {(item.status === "pending" || item.status === "failed") && (
                      <button
                        onClick={() => handleGenerateOne(item.id)}
                        disabled={isGeneratingThis || generatingScripts}
                        className="text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
                        title="生成腳本"
                      >
                        {isGeneratingThis ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : item.status === "failed" ? (
                          <RefreshCw size={16} />
                        ) : (
                          <Sparkles size={16} />
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => handleRemove(item.id)}
                      className="text-gray-300 hover:text-danger transition-colors"
                      title="移除"
                    >
                      <Trash2 size={16} />
                    </button>

                    {item.status === "completed" && (
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : item.id)
                        }
                      >
                        {isExpanded ? (
                          <ChevronUp size={16} className="text-gray-400" />
                        ) : (
                          <ChevronDown
                            size={16}
                            className="text-gray-400"
                          />
                        )}
                      </button>
                    )}
                  </div>

                  {/* 展開腳本 */}
                  {isExpanded &&
                    item.status === "completed" &&
                    item.script_timecodes && (
                      <div className="px-4 pb-4">
                        <div className="bg-gray-50 rounded-lg overflow-x-auto">
                          <table className="w-full text-sm min-w-[700px]">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-3 py-2 text-left w-24">
                                  時間碼
                                </th>
                                <th className="px-3 py-2 text-left w-1/3">
                                  畫面描述
                                </th>
                                <th className="px-3 py-2 text-left w-1/3">
                                  台詞/旁白
                                </th>
                                <th className="px-3 py-2 text-left w-1/4">
                                  拍攝備註
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {(
                                item.script_timecodes as ScriptTimecode[]
                              ).map((tc, i) => (
                                <tr key={i} className="hover:bg-gray-100/50">
                                  <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">
                                    {tc.timecode}
                                  </td>
                                  <td className="px-3 py-2">
                                    {tc.scene}
                                  </td>
                                  <td className="px-3 py-2 text-gray-700 font-medium">
                                    {tc.dialogue || "-"}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-400 italic">
                                    {tc.note || ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
