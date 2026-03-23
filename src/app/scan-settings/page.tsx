"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { supabase } from "@/lib/supabase";
import {
  Keyword,
  TrackedAccount,
  Threshold,
  Platform,
  AudienceGroup,
  AudienceTrack,
} from "@/lib/types";
import { platformLabel, platformIcon } from "@/lib/utils";
import {
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Save,
  Users,
  Route,
  ChevronRight,
  Sparkles,
  Loader2,
  Check,
} from "lucide-react";

export default function ScanSettingsPage() {
  const { current } = useProject();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [weeklyKpi, setWeeklyKpi] = useState(100);

  // 區塊 E — 人群與賽道
  const [audienceGroups, setAudienceGroups] = useState<AudienceGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<AudienceTrack[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("");
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackIcon, setNewTrackIcon] = useState("");
  const [newTrackKeywords, setNewTrackKeywords] = useState("");

  // AI 人群賽道建議
  interface AiTrack { name: string; icon: string; keywords: string[] }
  interface AiSuggestion { group_name: string; group_icon: string; tracks: AiTrack[] }
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [addedAiGroups, setAddedAiGroups] = useState<Set<string>>(new Set());

  async function handleAiSuggestAudience() {
    if (!current) return;
    setLoadingAi(true);
    setAiSuggestions([]);
    try {
      const res = await fetch("/api/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: current.id, type: "audience" }),
      });
      const data = await res.json();
      setAiSuggestions(data.audience ?? []);
    } catch {
      setAiSuggestions([]);
    }
    setLoadingAi(false);
  }

  async function handleAddAiGroup(suggestion: AiSuggestion) {
    if (!current) return;
    const key = suggestion.group_name;
    if (addedAiGroups.has(key)) return;

    // 建立人群
    const { data: group } = await supabase
      .from("vb_audience_groups")
      .insert({
        project_id: current.id,
        name: suggestion.group_name,
        icon: suggestion.group_icon,
        is_active: true,
      })
      .select("id")
      .single();

    if (group) {
      // 建立所有賽道
      const trackRows = suggestion.tracks.map((t) => ({
        audience_group_id: group.id,
        name: t.name,
        icon: t.icon,
        suggested_keywords: t.keywords,
        is_active: true,
      }));
      await supabase.from("vb_audience_tracks").insert(trackRows);

      // 同時把所有賽道關鍵字直接寫進關鍵字清單
      const allKeywords = suggestion.tracks.flatMap((t) => t.keywords);
      const uniqueKeywords = [...new Set(allKeywords)];

      // 排除已存在的關鍵字
      const { data: existing } = await supabase
        .from("vb_keywords")
        .select("keyword")
        .eq("project_id", current.id);
      const existingSet = new Set((existing || []).map((k: any) => k.keyword));

      const newKeywords = uniqueKeywords.filter((kw) => !existingSet.has(kw));
      if (newKeywords.length > 0) {
        const kwRows = newKeywords.map((kw) => ({
          project_id: current.id,
          keyword: kw,
          platforms: current.platforms,
          source: "ai_audience",
          is_active: true,
        }));
        await supabase.from("vb_keywords").insert(kwRows);
      }
    }

    setAddedAiGroups((prev) => new Set([...prev, key]));
    loadData();
  }

  // 新增表單
  const [newKeyword, setNewKeyword] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountPlatform, setNewAccountPlatform] =
    useState<Platform>("douyin");
  const [newAccountUrl, setNewAccountUrl] = useState("");

  const loadData = useCallback(async () => {
    if (!current) return;

    const [kw, acc, th, ag] = await Promise.all([
      supabase
        .from("vb_keywords")
        .select("*")
        .eq("project_id", current.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("vb_tracked_accounts")
        .select("*")
        .eq("project_id", current.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("vb_thresholds")
        .select("*")
        .eq("project_id", current.id),
      supabase
        .from("vb_audience_groups")
        .select("*")
        .eq("project_id", current.id)
        .order("name"),
    ]);

    setKeywords((kw.data as Keyword[]) ?? []);
    setAccounts((acc.data as TrackedAccount[]) ?? []);
    setThresholds((th.data as Threshold[]) ?? []);
    setAudienceGroups((ag.data as AudienceGroup[]) ?? []);
    setWeeklyKpi(current.weekly_kpi);
  }, [current]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function addKeyword() {
    if (!current || !newKeyword.trim()) return;
    await supabase.from("vb_keywords").insert({
      project_id: current.id,
      keyword: newKeyword.trim(),
      platforms: current.platforms,
      source: "manual",
      is_active: true,
    });
    setNewKeyword("");
    loadData();
  }

  async function toggleKeyword(id: string, active: boolean) {
    await supabase.from("vb_keywords").update({ is_active: !active }).eq("id", id);
    loadData();
  }

  async function deleteKeyword(id: string) {
    await supabase.from("vb_keywords").delete().eq("id", id);
    loadData();
  }

  async function addAccount() {
    if (!current || !newAccountName.trim()) return;
    await supabase.from("vb_tracked_accounts").insert({
      project_id: current.id,
      platform: newAccountPlatform,
      account_id: newAccountName.trim().replace("@", ""),
      account_name: newAccountName.trim(),
      account_url: newAccountUrl.trim() || null,
      source: "manual",
      is_active: true,
    });
    setNewAccountName("");
    setNewAccountUrl("");
    loadData();
  }

  async function deleteAccount(id: string) {
    await supabase.from("vb_tracked_accounts").delete().eq("id", id);
    loadData();
  }

  async function updateThreshold(
    id: string,
    field: string,
    value: number
  ) {
    await supabase
      .from("vb_thresholds")
      .update({ [field]: value })
      .eq("id", id);
  }

  async function updateKpi(value: number) {
    if (!current) return;
    setWeeklyKpi(value);
    await supabase
      .from("vb_projects")
      .update({ weekly_kpi: value })
      .eq("id", current.id);
  }

  // ---- 區塊 E: 人群與賽道 CRUD ----

  async function loadTracks(groupId: string) {
    const { data } = await supabase
      .from("vb_audience_tracks")
      .select("*")
      .eq("audience_group_id", groupId)
      .order("name");
    setTracks((data as AudienceTrack[]) ?? []);
  }

  async function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    await loadTracks(groupId);
  }

  async function addAudienceGroup() {
    if (!current || !newGroupName.trim()) return;
    await supabase.from("vb_audience_groups").insert({
      project_id: current.id,
      name: newGroupName.trim(),
      icon: newGroupIcon.trim() || null,
      is_active: true,
    });
    setNewGroupName("");
    setNewGroupIcon("");
    loadData();
  }

  async function deleteAudienceGroup(id: string) {
    await supabase.from("vb_audience_tracks").delete().eq("audience_group_id", id);
    await supabase.from("vb_audience_groups").delete().eq("id", id);
    if (selectedGroupId === id) {
      setSelectedGroupId(null);
      setTracks([]);
    }
    loadData();
  }

  async function toggleAudienceGroup(id: string, active: boolean) {
    await supabase.from("vb_audience_groups").update({ is_active: !active }).eq("id", id);
    loadData();
  }

  async function addTrack() {
    if (!selectedGroupId || !newTrackName.trim()) return;
    const keywords = newTrackKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    await supabase.from("vb_audience_tracks").insert({
      audience_group_id: selectedGroupId,
      name: newTrackName.trim(),
      icon: newTrackIcon.trim() || null,
      suggested_keywords: keywords,
      is_active: true,
    });
    setNewTrackName("");
    setNewTrackIcon("");
    setNewTrackKeywords("");
    loadTracks(selectedGroupId);
  }

  async function deleteTrack(id: string) {
    await supabase.from("vb_audience_tracks").delete().eq("id", id);
    if (selectedGroupId) loadTracks(selectedGroupId);
  }

  async function toggleTrack(id: string, active: boolean) {
    await supabase.from("vb_audience_tracks").update({ is_active: !active }).eq("id", id);
    if (selectedGroupId) loadTracks(selectedGroupId);
  }

  if (!current) {
    return (
      <div className="p-8 text-center text-gray-400">請先選擇專案</div>
    );
  }

  const sourceLabels: Record<string, string> = {
    manual: "手動",
    ai_content: "AI 內容",
    ai_audience: "AI 人群",
    ai_account: "AI 帳號",
    ai_trending: "AI 熱搜",
    ai_suggested: "AI 建議",
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold mb-1">掃描設定</h1>
      <p className="text-gray-500 text-sm mb-6">
        管理關鍵字、對標帳號、爆款門檻、週目標 KPI、人群與賽道
      </p>

      {/* 區塊 A — 關鍵字清單 */}
      <section className="mb-8 border border-border rounded-xl bg-card-bg">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">關鍵字清單</h2>
          <span className="text-xs text-gray-400">{keywords.length} 個</span>
        </div>

        {/* 新增列 */}
        <div className="p-4 border-b border-border flex gap-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            placeholder="輸入關鍵字..."
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={addKeyword}
            className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} /> 新增
          </button>
        </div>

        {/* 列表 */}
        <div className="divide-y divide-border max-h-80 overflow-y-auto">
          {keywords.map((kw) => (
            <div
              key={kw.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
            >
              <span className="font-medium text-sm flex-1">{kw.keyword}</span>
              <div className="flex gap-1">
                {kw.platforms.map((p) => (
                  <span
                    key={p}
                    className="text-xs bg-gray-100 px-2 py-0.5 rounded"
                    title={platformLabel(p)}
                  >
                    {platformIcon(p)}
                  </span>
                ))}
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {sourceLabels[kw.source] ?? kw.source}
              </span>
              <button
                onClick={() => toggleKeyword(kw.id, kw.is_active)}
                className={kw.is_active ? "text-success" : "text-gray-300"}
                title={kw.is_active ? "啟用中" : "已停用"}
              >
                {kw.is_active ? (
                  <ToggleRight size={22} />
                ) : (
                  <ToggleLeft size={22} />
                )}
              </button>
              <button
                onClick={() => deleteKeyword(kw.id)}
                className="text-gray-300 hover:text-danger transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {keywords.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-sm">
              尚無關鍵字，請新增或透過 AI 建議
            </div>
          )}
        </div>
      </section>

      {/* 區塊 B — 對標帳號清單 */}
      <section className="mb-8 border border-border rounded-xl bg-card-bg">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">對標帳號清單</h2>
          <span className="text-xs text-gray-400">{accounts.length} 個</span>
        </div>

        <div className="p-4 border-b border-border flex flex-wrap gap-2">
          <select
            value={newAccountPlatform}
            onChange={(e) =>
              setNewAccountPlatform(e.target.value as Platform)
            }
            className="w-full sm:w-auto px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            {current.platforms.map((p) => (
              <option key={p} value={p}>
                {platformIcon(p)} {platformLabel(p)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
            placeholder="帳號名稱..."
            className="flex-1 min-w-[150px] px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
          />
          <input
            type="text"
            value={newAccountUrl}
            onChange={(e) => setNewAccountUrl(e.target.value)}
            placeholder="帳號連結（選填）"
            className="flex-1 min-w-[150px] px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={addAccount}
            className="w-full sm:w-auto flex items-center justify-center gap-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} /> 新增
          </button>
        </div>

        <div className="divide-y divide-border max-h-80 overflow-y-auto">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
            >
              <span className="text-sm">
                {platformIcon(acc.platform)}
              </span>
              <span className="font-medium text-sm flex-1">
                {acc.account_name ?? acc.account_id}
              </span>
              {acc.account_url && (
                <a
                  href={acc.account_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  連結
                </a>
              )}
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {sourceLabels[acc.source] ?? acc.source}
              </span>
              <button
                onClick={() => deleteAccount(acc.id)}
                className="text-gray-300 hover:text-danger transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-sm">
              尚無對標帳號
            </div>
          )}
        </div>
      </section>

      {/* 區塊 C — 爆款門檻 + 區塊 D — 週目標 KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="border border-border rounded-xl bg-card-bg">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">爆款門檻</h2>
          </div>
          <div className="p-4 space-y-4">
            {thresholds.map((th) => (
              <div key={th.id} className="space-y-2">
                <div className="text-sm font-medium flex items-center gap-2">
                  {platformIcon(th.platform)}{" "}
                  {platformLabel(th.platform)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">最低點讚</label>
                    <input
                      type="number"
                      defaultValue={th.min_likes}
                      onBlur={(e) =>
                        updateThreshold(
                          th.id,
                          "min_likes",
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">最低分享</label>
                    <input
                      type="number"
                      defaultValue={th.min_shares}
                      onBlur={(e) =>
                        updateThreshold(
                          th.id,
                          "min_shares",
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">最低評論</label>
                    <input
                      type="number"
                      defaultValue={th.min_comments}
                      onBlur={(e) =>
                        updateThreshold(
                          th.id,
                          "min_comments",
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">最近天數</label>
                    <input
                      type="number"
                      defaultValue={th.max_days_old}
                      onBlur={(e) =>
                        updateThreshold(
                          th.id,
                          "max_days_old",
                          parseInt(e.target.value) || 30
                        )
                      }
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            ))}
            {thresholds.length === 0 && (
              <p className="text-sm text-gray-400">尚無門檻設定</p>
            )}
          </div>
        </section>

        <section className="border border-border rounded-xl bg-card-bg">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">週目標 KPI</h2>
          </div>
          <div className="p-4">
            <label className="text-xs text-gray-400">
              每週目標爆款數量
            </label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="number"
                value={weeklyKpi}
                onChange={(e) => setWeeklyKpi(parseInt(e.target.value) || 0)}
                onBlur={(e) => updateKpi(parseInt(e.target.value) || 100)}
                className="w-32 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
              />
              <span className="text-sm text-gray-400">支 / 週</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              掃描時若未達此數量，系統會自動啟動補量機制
            </p>
          </div>
        </section>
      </div>

      {/* 區塊 E — 人群與賽道管理 */}
      <section className="mt-8 border border-border rounded-xl bg-card-bg">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Users size={18} /> 人群與賽道管理
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {audienceGroups.length} 個人群
            </span>
            <button
              onClick={handleAiSuggestAudience}
              disabled={loadingAi}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {loadingAi ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              AI 建議
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-y md:divide-y-0 divide-border min-h-[240px] md:min-h-[320px]">
          {/* 左欄：人群列表 */}
          <div>
            {/* 新增人群 */}
            <div className="p-3 border-b border-border flex gap-2">
              <input
                type="text"
                value={newGroupIcon}
                onChange={(e) => setNewGroupIcon(e.target.value)}
                placeholder="圖示"
                className="w-14 px-2 py-2 border border-border rounded-lg text-sm text-center focus:outline-none focus:border-primary"
                maxLength={2}
              />
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAudienceGroup()}
                placeholder="人群名稱..."
                className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
              />
              <button
                onClick={addAudienceGroup}
                className="flex items-center gap-1 px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* 人群列表 */}
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {audienceGroups.map((g) => (
                <div
                  key={g.id}
                  onClick={() => selectGroup(g.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    selectedGroupId === g.id
                      ? "bg-primary/10"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className="text-lg">{g.icon || "👥"}</span>
                  <span className="font-medium text-sm flex-1">{g.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAudienceGroup(g.id, g.is_active);
                    }}
                    className={g.is_active ? "text-success" : "text-gray-300"}
                    title={g.is_active ? "啟用中" : "已停用"}
                  >
                    {g.is_active ? (
                      <ToggleRight size={22} />
                    ) : (
                      <ToggleLeft size={22} />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAudienceGroup(g.id);
                    }}
                    className="text-gray-300 hover:text-danger transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                  {selectedGroupId === g.id && (
                    <ChevronRight size={16} className="text-primary" />
                  )}
                </div>
              ))}
              {audienceGroups.length === 0 && (
                <div className="p-4 text-center text-gray-400 text-sm">
                  尚無人群，請新增
                </div>
              )}
            </div>
          </div>

          {/* 右欄：賽道列表 */}
          <div>
            {selectedGroupId ? (
              <>
                {/* 新增賽道 */}
                <div className="p-3 border-b border-border space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTrackIcon}
                      onChange={(e) => setNewTrackIcon(e.target.value)}
                      placeholder="圖示"
                      className="w-14 px-2 py-2 border border-border rounded-lg text-sm text-center focus:outline-none focus:border-primary"
                      maxLength={2}
                    />
                    <input
                      type="text"
                      value={newTrackName}
                      onChange={(e) => setNewTrackName(e.target.value)}
                      placeholder="賽道名稱..."
                      className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={addTrack}
                      className="flex items-center gap-1 px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newTrackKeywords}
                    onChange={(e) => setNewTrackKeywords(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTrack()}
                    placeholder="建議關鍵字（逗號分隔，如：減脂,增肌,體態）"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                {/* 賽道列表 */}
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {tracks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                    >
                      <span className="text-lg">{t.icon || "🛤️"}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block">
                          {t.name}
                        </span>
                        {t.suggested_keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {t.suggested_keywords.map((kw, i) => (
                              <span
                                key={i}
                                className="text-xs bg-gray-100 px-2 py-0.5 rounded"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => toggleTrack(t.id, t.is_active)}
                        className={t.is_active ? "text-success" : "text-gray-300"}
                        title={t.is_active ? "啟用中" : "已停用"}
                      >
                        {t.is_active ? (
                          <ToggleRight size={22} />
                        ) : (
                          <ToggleLeft size={22} />
                        )}
                      </button>
                      <button
                        onClick={() => deleteTrack(t.id)}
                        className="text-gray-300 hover:text-danger transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {tracks.length === 0 && (
                    <div className="p-4 text-center text-gray-400 text-sm">
                      此人群尚無賽道，請新增
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                <div className="text-center">
                  <Route size={32} className="mx-auto mb-2 opacity-30" />
                  請先選擇左側人群
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI 建議面板 */}
        {(loadingAi || aiSuggestions.length > 0) && (
          <div className="border-t border-border">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles size={16} className="text-primary" />
                AI 建議的人群與賽道
              </h3>
            </div>
            {loadingAi ? (
              <div className="p-8 flex items-center justify-center gap-2 text-gray-400">
                <Loader2 size={20} className="animate-spin" />
                AI 分析爆款數據中...
              </div>
            ) : (
              <div className="divide-y divide-border">
                {aiSuggestions.map((sg) => {
                  const isAdded = addedAiGroups.has(sg.group_name);
                  return (
                    <div key={sg.group_name} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{sg.group_icon}</span>
                          <span className="font-medium text-sm">{sg.group_name}</span>
                          <span className="text-xs text-gray-400">
                            {sg.tracks.length} 個賽道
                          </span>
                        </div>
                        {isAdded ? (
                          <span className="flex items-center gap-1 text-xs text-success">
                            <Check size={14} /> 已加入
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAddAiGroup(sg)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                          >
                            <Plus size={14} /> 加入人群 + 關鍵字
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 ml-8">
                        {sg.tracks.map((t) => (
                          <div
                            key={t.name}
                            className="bg-gray-50 rounded-lg px-3 py-2 text-xs"
                          >
                            <span className="font-medium">
                              {t.icon} {t.name}
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {t.keywords.map((kw) => (
                                <span
                                  key={kw}
                                  className="bg-blue-50 text-primary px-2 py-0.5 rounded"
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
