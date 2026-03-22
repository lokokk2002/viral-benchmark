"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { supabase } from "@/lib/supabase";
import { ViralVideo, Platform, SourceType } from "@/lib/types";
import {
  platformIcon,
  platformLabel,
  sourceLabel,
  formatNumber,
  getShootWeek,
} from "@/lib/utils";
import {
  Search,
  Download,
  Zap,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  Loader2,
  UserPlus,
  UserCheck,
} from "lucide-react";

export default function ViralVideosPage() {
  const { current } = useProject();
  const [videos, setVideos] = useState<ViralVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [trackedAuthors, setTrackedAuthors] = useState<Set<string>>(new Set());
  const [trackingAuthor, setTrackingAuthor] = useState<string | null>(null);

  // 篩選器
  const [filterPlatform, setFilterPlatform] = useState<Platform | "all">(
    "all"
  );
  const [filterSource, setFilterSource] = useState<SourceType | "all">("all");
  const [sortField, setSortField] = useState<"likes" | "shares" | "discovered_at">(
    "discovered_at"
  );
  const [sortAsc, setSortAsc] = useState(false);

  const loadData = useCallback(async () => {
    if (!current) return;
    setLoading(true);

    let query = supabase
      .from("vb_viral_videos")
      .select("*")
      .eq("project_id", current.id)
      .order(sortField, { ascending: sortAsc })
      .limit(200);

    if (filterPlatform !== "all") {
      query = query.eq("platform", filterPlatform);
    }
    if (filterSource !== "all") {
      query = query.eq("source_type", filterSource);
    }

    const { data } = await query;
    setVideos((data as ViralVideo[]) ?? []);
    setLoading(false);
  }, [current, filterPlatform, filterSource, sortField, sortAsc]);

  // 載入已追蹤帳號（用於判斷按鈕狀態）
  useEffect(() => {
    if (!current) return;
    supabase
      .from("vb_tracked_accounts")
      .select("account_id, platform")
      .eq("project_id", current.id)
      .then(({ data }) => {
        const set = new Set(
          (data || []).map((a: any) => `${a.platform}:${a.account_id}`)
        );
        setTrackedAuthors(set);
      });
  }, [current]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleTrackAuthor(v: ViralVideo) {
    if (!current || !v.author_id) return;
    const key = `${v.platform}:${v.author_id}`;
    if (trackedAuthors.has(key)) return;

    setTrackingAuthor(v.id);
    await supabase.from("vb_tracked_accounts").insert({
      project_id: current.id,
      platform: v.platform,
      account_id: v.author_id,
      account_name: v.author_name || v.author_id,
      account_url: v.video_url ? v.video_url.split("/video/")[0] : null,
      source: "manual",
      is_active: true,
    });
    setTrackedAuthors((prev) => new Set([...prev, key]));
    setTrackingAuthor(null);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === videos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(videos.map((v) => v.id)));
    }
  }

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  async function handleScan() {
    if (!current) return;
    setScanning(true);
    try {
      const res = await fetch("/api/trigger-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: current.id }),
      });
      const data = await res.json();
      if (data.success) {
        const s = data.summary;
        alert(
          `掃描完成！\n原始抓取：${s.total_raw} 筆\n去重後：${s.total_after_dedup} 筆\n過濾後入表：${s.total_after_filter} 筆\nKPI ${s.kpi_met ? "達標" : "未達標"}（目標 ${s.kpi_target}）`
        );
      } else {
        alert(`掃描失敗：${data.error || "未知錯誤"}`);
      }
    } catch (err: any) {
      alert(`掃描失敗：${err.message}`);
    }
    setScanning(false);
    loadData();
  }

  function handleExportCsv() {
    if (videos.length === 0) return;

    const BOM = "\uFEFF";
    const headers = [
      "平台", "來源", "標題", "作者", "點讚", "分享", "評論", "播放",
      "發現日期", "影片連結", "Hashtags",
    ];
    const rows = videos.map((v) => [
      platformLabel(v.platform),
      sourceLabel(v.source_type).replace(/[^\u4e00-\u9fff\w]/g, ""),
      `"${(v.title || "").replace(/"/g, '""')}"`,
      v.author_name || "",
      v.likes,
      v.shares,
      v.comments,
      v.plays,
      v.discovered_at
        ? new Date(v.discovered_at).toLocaleDateString("zh-TW")
        : "",
      v.video_url || "",
      (v.hashtags || []).join(" "),
    ]);

    const csv =
      BOM +
      headers.join(",") +
      "\n" +
      rows.map((r) => r.join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `爆款對標_${current?.name || "export"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAddToShootQueue() {
    if (!current || selected.size === 0) return;
    setAdding(true);
    const week = getShootWeek();
    const rows = Array.from(selected).map((vid) => ({
      project_id: current.id,
      viral_video_id: vid,
      status: "pending",
      shoot_week: week,
    }));
    const { data: inserted } = await supabase
      .from("vb_shoot_queue")
      .insert(rows)
      .select("id");

    const count = rows.length;
    setSelected(new Set());
    setAdding(false);

    // 自動觸發腳本生成（不需操盤手手動按）
    if (inserted && inserted.length > 0) {
      const queueIds = inserted.map((r: any) => r.id);
      fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue_item_ids: queueIds }),
      }).catch(() => {});
      alert(
        `已將 ${count} 支影片加入本週拍攝表，腳本正在自動生成中...\n請到「本週拍攝表」查看進度`
      );
    } else {
      alert(`已將 ${count} 支影片加入本週拍攝表`);
    }
  }

  if (!current) {
    return (
      <div className="p-8 text-center text-gray-400">請先選擇專案</div>
    );
  }

  const SortIcon = ({
    field,
  }: {
    field: typeof sortField;
  }) =>
    sortField === field ? (
      sortAsc ? (
        <ChevronUp size={14} />
      ) : (
        <ChevronDown size={14} />
      )
    ) : null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">爆款對標表</h1>
          <p className="text-gray-500 text-sm">
            瀏覽本週掃到的爆款，篩選、排序、勾選加入拍攝表
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {scanning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Zap size={16} />
            )}
            手動掃描
          </button>
          <button
            onClick={handleExportCsv}
            disabled={videos.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            匯出 Excel
          </button>
        </div>
      </div>

      {/* 篩選器 */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterPlatform}
          onChange={(e) =>
            setFilterPlatform(e.target.value as Platform | "all")
          }
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
        >
          <option value="all">全部平台</option>
          {current.platforms.map((p) => (
            <option key={p} value={p}>
              {platformIcon(p)} {platformLabel(p)}
            </option>
          ))}
        </select>
        <select
          value={filterSource}
          onChange={(e) =>
            setFilterSource(e.target.value as SourceType | "all")
          }
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
        >
          <option value="all">全部來源</option>
          <option value="keyword">核心</option>
          <option value="account">帳號</option>
          <option value="ai_expand">內容擴展</option>
          <option value="audience_expand">人群擴展</option>
        </select>
      </div>

      {/* 表格 */}
      <div className="border border-border rounded-xl bg-card-bg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={
                    videos.length > 0 && selected.size === videos.length
                  }
                  onChange={toggleAll}
                  className="w-4 h-4 rounded"
                />
              </th>
              <th className="p-3 text-left">平台</th>
              <th className="p-3 text-left">來源</th>
              <th className="p-3 text-left">標題</th>
              <th className="p-3 text-left">作者</th>
              <th
                className="p-3 text-right cursor-pointer hover:text-primary"
                onClick={() => handleSort("likes")}
              >
                <span className="inline-flex items-center gap-1">
                  點讚 <SortIcon field="likes" />
                </span>
              </th>
              <th className="p-3 text-right">分享</th>
              <th className="p-3 text-right">評論</th>
              <th
                className="p-3 text-right cursor-pointer hover:text-primary"
                onClick={() => handleSort("discovered_at")}
              >
                <span className="inline-flex items-center gap-1">
                  發現日期 <SortIcon field="discovered_at" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-400">
                  <Loader2
                    size={20}
                    className="inline animate-spin mr-2"
                  />
                  載入中...
                </td>
              </tr>
            ) : videos.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-400">
                  尚無爆款資料，請先執行掃描
                </td>
              </tr>
            ) : (
              videos.map((v) => (
                <>
                  <tr
                    key={v.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(v.id)}
                        onChange={() => toggleSelect(v.id)}
                        className="w-4 h-4 rounded"
                      />
                    </td>
                    <td className="p-3">
                      <span title={platformLabel(v.platform)}>
                        {platformIcon(v.platform)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                        {sourceLabel(v.source_type)}
                      </span>
                    </td>
                    <td className="p-3 max-w-xs">
                      <button
                        onClick={() =>
                          setExpandedId(
                            expandedId === v.id ? null : v.id
                          )
                        }
                        className="text-left hover:text-primary transition-colors truncate block w-full"
                      >
                        {v.title || "（無標題）"}
                      </button>
                    </td>
                    <td className="p-3 text-gray-600">
                      {v.author_name || "-"}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {formatNumber(v.likes)}
                    </td>
                    <td className="p-3 text-right">
                      {formatNumber(v.shares)}
                    </td>
                    <td className="p-3 text-right">
                      {formatNumber(v.comments)}
                    </td>
                    <td className="p-3 text-right text-gray-500">
                      {v.discovered_at
                        ? new Date(v.discovered_at).toLocaleDateString(
                            "zh-TW"
                          )
                        : "-"}
                    </td>
                  </tr>
                  {expandedId === v.id && (
                    <tr key={`${v.id}-detail`}>
                      <td colSpan={9} className="p-4 bg-blue-50">
                        <div className="flex gap-4">
                          {v.thumbnail_url && (
                            <img
                              src={v.thumbnail_url}
                              alt=""
                              className="w-32 h-24 object-cover rounded-lg"
                            />
                          )}
                          <div className="flex-1 text-sm space-y-1">
                            <p>
                              <strong>播放：</strong>
                              {formatNumber(v.plays)}
                            </p>
                            <p>
                              <strong>關鍵字：</strong>
                              {v.source_keyword || "-"}
                            </p>
                            {v.hashtags.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {v.hashtags.map((h) => (
                                  <span
                                    key={h}
                                    className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                                  >
                                    #{h}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              {v.video_url && (
                                <a
                                  href={v.video_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <ExternalLink size={14} /> 觀看影片
                                </a>
                              )}
                              {v.author_id && (
                                trackedAuthors.has(`${v.platform}:${v.author_id}`) ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-success">
                                    <UserCheck size={14} /> 已追蹤
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleTrackAuthor(v)}
                                    disabled={trackingAuthor === v.id}
                                    className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary-hover transition-colors disabled:opacity-50"
                                  >
                                    {trackingAuthor === v.id ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <UserPlus size={12} />
                                    )}
                                    追蹤 {v.author_name || "此帳號"}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 底部操作列 */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-60 right-0 bg-white border-t border-border p-4 flex items-center justify-between shadow-lg">
          <span className="text-sm text-gray-600">
            已選 <strong>{selected.size}</strong> 支
          </span>
          <button
            onClick={handleAddToShootQueue}
            disabled={adding}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
            加入本週拍攝表
          </button>
        </div>
      )}
    </div>
  );
}
