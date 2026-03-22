"use client";

import { useState } from "react";
import { useProject } from "@/lib/project-context";
import { supabase } from "@/lib/supabase";
import { KeywordSuggestion, AudienceGroup, AudienceTrack } from "@/lib/types";
import {
  Sparkles,
  TrendingUp,
  Users,
  BarChart3,
  Instagram,
  ChevronRight,
  Plus,
  Zap,
  Loader2,
  Check,
} from "lucide-react";

type SuggestType =
  | "content"
  | "account"
  | "instagram"
  | "trending"
  | "audience";

const DIRECTIONS: {
  type: SuggestType;
  label: string;
  icon: typeof Sparkles;
  desc: string;
}[] = [
  {
    type: "content",
    label: "從爆款反推",
    icon: TrendingUp,
    desc: "分析近期爆款的標題和 hashtag",
  },
  {
    type: "account",
    label: "對標帳號趨勢",
    icon: BarChart3,
    desc: "分析對標帳號的主題趨勢變化",
  },
  {
    type: "instagram",
    label: "自家 IG 數據",
    icon: Instagram,
    desc: "分析高互動內容的關鍵字",
  },
  {
    type: "trending",
    label: "熱搜榜",
    icon: Sparkles,
    desc: "過濾品牌相關的熱搜詞",
  },
  {
    type: "audience",
    label: "人群擴展",
    icon: Users,
    desc: "根據人群賽道生成建議",
  },
];

export default function KeywordsPage() {
  const { current } = useProject();
  const [activeType, setActiveType] = useState<SuggestType | null>(null);
  const [suggestions, setSuggestions] = useState<KeywordSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [audienceGroups, setAudienceGroups] = useState<AudienceGroup[]>([]);
  const [audienceTracks, setAudienceTracks] = useState<AudienceTrack[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [showAudiencePanel, setShowAudiencePanel] = useState(false);

  async function handleDirection(type: SuggestType) {
    if (!current) return;

    if (type === "audience") {
      setShowAudiencePanel(true);
      setActiveType("audience");
      // 載入人群資料
      const { data: groups } = await supabase
        .from("vb_audience_groups")
        .select("*")
        .eq("project_id", current.id)
        .eq("is_active", true);
      setAudienceGroups((groups as AudienceGroup[]) ?? []);
      return;
    }

    setShowAudiencePanel(false);
    setActiveType(type);
    setLoading(true);
    setSuggestions([]);
    setSelected(new Set());

    try {
      const res = await fetch("/api/keyword-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: current.id,
          suggest_type: type,
        }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch (err) {
      setSuggestions([
        { keyword: `載入失敗：${err}`, source: "錯誤" },
      ]);
    }
    setLoading(false);
  }

  async function handleSelectGroup(groupId: string) {
    setSelectedGroup(groupId);
    setSelectedTrack(null);
    const { data: tracks } = await supabase
      .from("vb_audience_tracks")
      .select("*")
      .eq("audience_group_id", groupId)
      .eq("is_active", true);
    setAudienceTracks((tracks as AudienceTrack[]) ?? []);
  }

  async function handleSelectTrack(track: AudienceTrack) {
    setSelectedTrack(track.id);
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await fetch("/api/keyword-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: current!.id,
          suggest_type: "audience",
          audience_track_id: track.id,
        }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      setSuggestions(
        track.suggested_keywords.map((kw) => ({
          keyword: kw,
          source: `人群擴展 / ${track.name}`,
        }))
      );
    }
    setLoading(false);
  }

  function toggleSelect(keyword: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map((s) => s.keyword)));
    }
  }

  async function handleAdd(andScan: boolean) {
    if (!current || selected.size === 0) return;
    setAdding(true);

    const keywords = Array.from(selected);
    const rows = keywords.map((kw) => ({
      project_id: current.id,
      keyword: kw,
      platforms: current.platforms,
      source:
        activeType === "audience"
          ? "ai_audience"
          : activeType === "content"
            ? "ai_content"
            : activeType === "account"
              ? "ai_account"
              : activeType === "trending"
                ? "ai_trending"
                : "manual",
      is_active: true,
    }));

    await supabase.from("vb_keywords").insert(rows);

    if (andScan) {
      // 觸發 Workflow 1
      try {
        await fetch("/api/trigger-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: current.id }),
        });
      } catch {
        // n8n 尚未串接
      }
    }

    // 清除已加入的
    setSuggestions((prev) => prev.filter((s) => !selected.has(s.keyword)));
    setSelected(new Set());
    setAdding(false);
  }

  if (!current) {
    return (
      <div className="p-8 text-center text-gray-400">請先選擇專案</div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">AI 關鍵字建議</h1>
      <p className="text-gray-500 text-sm mb-6">
        從 5 個方向獲得關鍵字建議，多選後加入掃描清單
      </p>

      {/* 5 個方向按鈕 */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {DIRECTIONS.map((d) => (
          <button
            key={d.type}
            onClick={() => handleDirection(d.type)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-sm ${
              activeType === d.type
                ? "border-primary bg-blue-50 text-primary"
                : "border-border bg-card-bg hover:border-primary/40"
            }`}
          >
            <d.icon size={22} />
            <span className="font-medium">{d.label}</span>
            <span className="text-xs text-gray-400 text-center">
              {d.desc}
            </span>
          </button>
        ))}
      </div>

      {/* 人群擴展二級選單 */}
      {showAudiencePanel && (
        <div className="mb-6 border border-border rounded-xl p-4 bg-card-bg">
          <div className="flex gap-6">
            {/* 人群列表 */}
            <div className="w-48">
              <div className="text-xs text-gray-400 mb-2 font-medium">
                人群
              </div>
              {audienceGroups.length === 0 ? (
                <p className="text-sm text-gray-400">尚無人群資料</p>
              ) : (
                audienceGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleSelectGroup(g.id)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-1 transition-colors ${
                      selectedGroup === g.id
                        ? "bg-primary text-white"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    {g.icon} {g.name}
                  </button>
                ))
              )}
            </div>

            {/* 賽道列表 */}
            <div className="w-48">
              <div className="text-xs text-gray-400 mb-2 font-medium">
                賽道
              </div>
              {selectedGroup ? (
                audienceTracks.length === 0 ? (
                  <p className="text-sm text-gray-400">尚無賽道資料</p>
                ) : (
                  audienceTracks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTrack(t)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-1 flex items-center gap-1 transition-colors ${
                        selectedTrack === t.id
                          ? "bg-primary text-white"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      {t.icon} {t.name}
                      <ChevronRight size={14} className="ml-auto" />
                    </button>
                  ))
                )
              ) : (
                <p className="text-sm text-gray-400">請先選擇人群</p>
              )}
            </div>

            {/* 建議關鍵字預覽 */}
            <div className="flex-1">
              <div className="text-xs text-gray-400 mb-2 font-medium">
                建議關鍵字
              </div>
              {selectedTrack && suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <span
                      key={s.keyword}
                      className="bg-blue-50 text-primary text-sm px-3 py-1 rounded-full"
                    >
                      {s.keyword}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">請選擇賽道</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 建議結果列表 */}
      {(loading || suggestions.length > 0) && (
        <div className="border border-border rounded-xl bg-card-bg">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">建議結果</h2>
              {suggestions.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {suggestions.length} 個
                </span>
              )}
            </div>
            {suggestions.length > 0 && (
              <button
                onClick={toggleAll}
                className="text-sm text-primary hover:underline"
              >
                {selected.size === suggestions.length
                  ? "取消全選"
                  : "全選"}
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
              AI 分析中...
            </div>
          ) : (
            <div className="divide-y divide-border">
              {suggestions.map((s) => (
                <label
                  key={s.keyword}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.keyword)}
                    onChange={() => toggleSelect(s.keyword)}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="font-medium text-sm">{s.keyword}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {s.source}
                  </span>
                  {s.occurrences && (
                    <span className="text-xs text-gray-400 ml-auto">
                      出現 {s.occurrences} 次
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 底部操作列 */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-60 right-0 bg-white border-t border-border p-4 flex items-center justify-between shadow-lg">
          <span className="text-sm text-gray-600">
            <Check size={16} className="inline mr-1" />
            已選 <strong>{selected.size}</strong> 個關鍵字
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => handleAdd(false)}
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary text-primary text-sm hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <Plus size={16} />
              加入關鍵字清單
            </button>
            <button
              onClick={() => handleAdd(true)}
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              <Zap size={16} />
              加入並立即掃描
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

