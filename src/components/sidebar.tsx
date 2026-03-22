"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProject } from "@/lib/project-context";
import { Platform } from "@/lib/types";
import { platformLabel } from "@/lib/utils";
import {
  Sparkles,
  Settings,
  TrendingUp,
  Film,
  ClipboardList,
  ChevronDown,
  Plus,
  X,
  Loader2,
  Pencil,
  Check,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

const NAV_ITEMS = [
  { href: "/keywords", label: "AI 智能建議", icon: Sparkles },
  { href: "/scan-settings", label: "掃描設定", icon: Settings },
  { href: "/viral-videos", label: "爆款對標表", icon: TrendingUp },
  { href: "/shoot-queue", label: "本週拍攝表", icon: Film },
  { href: "/shoot-plan", label: "拍攝計畫", icon: ClipboardList },
];

const ALL_PLATFORMS: { value: Platform; label: string }[] = [
  { value: "douyin", label: "抖音" },
  { value: "xiaohongshu", label: "小紅書" },
  { value: "tiktok", label: "TikTok" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { projects, current, setCurrent, addProject, updateProject, loading } = useProject();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 新增表單
  const [newName, setNewName] = useState("");
  const [newPlatforms, setNewPlatforms] = useState<Set<Platform>>(new Set());
  const [newKpi, setNewKpi] = useState(100);

  // 編輯表單
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlatforms, setEditPlatforms] = useState<Set<Platform>>(new Set());
  const [editKpi, setEditKpi] = useState(100);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function resetForm() {
    setNewName("");
    setNewPlatforms(new Set());
    setNewKpi(100);
    setError("");
    setShowNewForm(false);
  }

  function togglePlatform(p: Platform) {
    setNewPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function startEdit(project: typeof projects[number]) {
    setEditingProject(project.id);
    setEditName(project.name);
    setEditPlatforms(new Set(project.platforms));
    setEditKpi(project.weekly_kpi);
    setEditError("");
    setShowNewForm(false);
  }

  function cancelEdit() {
    setEditingProject(null);
    setEditName("");
    setEditPlatforms(new Set());
    setEditKpi(100);
    setEditError("");
  }

  function toggleEditPlatform(p: Platform) {
    setEditPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function handleUpdate() {
    if (!editingProject) return;
    const name = editName.trim();
    if (!name) {
      setEditError("請輸入專案名稱");
      return;
    }
    if (editPlatforms.size === 0) {
      setEditError("請至少選擇一個平台");
      return;
    }

    setEditSaving(true);
    setEditError("");

    const result = await updateProject({
      id: editingProject,
      name,
      platforms: Array.from(editPlatforms),
      weekly_kpi: editKpi,
    });

    setEditSaving(false);

    if (result) {
      cancelEdit();
    } else {
      setEditError("更新失敗，請確認 Supabase 連線");
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError("請輸入專案名稱");
      return;
    }
    if (newPlatforms.size === 0) {
      setError("請至少選擇一個平台");
      return;
    }

    // 自動產生 slug
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      || `project-${Date.now()}`;

    setSaving(true);
    setError("");

    const result = await addProject({
      name,
      slug,
      platforms: Array.from(newPlatforms),
      weekly_kpi: newKpi,
    });

    setSaving(false);

    if (result) {
      resetForm();
      setDropdownOpen(false);
    } else {
      setError("建立失敗，請確認 Supabase 連線或 slug 是否重複");
    }
  }

  return (
    <aside className="w-60 bg-sidebar-bg text-sidebar-text flex flex-col min-h-screen shrink-0">
      {/* 專案切換器 */}
      <div className="p-4 border-b border-white/10" ref={dropdownRef}>
        <div className="text-xs text-white/50 mb-1 font-medium">專案</div>
        <button
          onClick={() => {
            setDropdownOpen(!dropdownOpen);
            if (showNewForm) resetForm();
          }}
          className="w-full flex items-center justify-between bg-white/10 rounded-lg px-3 py-2 text-sm hover:bg-white/15 transition-colors"
        >
          <span className="truncate">
            {loading ? "載入中..." : current?.name ?? "選擇專案"}
          </span>
          <ChevronDown
            size={16}
            className={`shrink-0 ml-2 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>

        {dropdownOpen && (
          <div className="mt-1 bg-white/10 rounded-lg overflow-hidden">
            {/* 現有專案列表 */}
            {projects.map((p) =>
              editingProject === p.id ? (
                <div key={p.id} className="p-3 border-b border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60 font-medium">
                      編輯專案
                    </span>
                    <button
                      onClick={cancelEdit}
                      className="text-white/40 hover:text-white/80"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* 名稱 */}
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                    placeholder="專案名稱"
                    className="w-full px-2 py-1.5 rounded bg-white/10 text-sm placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-sidebar-active"
                    autoFocus
                  />

                  {/* 平台選擇 */}
                  <div>
                    <div className="text-xs text-white/50 mb-1">監控平台</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_PLATFORMS.map((pl) => (
                        <button
                          key={pl.value}
                          onClick={() => toggleEditPlatform(pl.value)}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            editPlatforms.has(pl.value)
                              ? "bg-sidebar-active text-white"
                              : "bg-white/10 text-white/60 hover:bg-white/20"
                          }`}
                        >
                          {pl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* KPI */}
                  <div>
                    <div className="text-xs text-white/50 mb-1">
                      週目標 KPI
                    </div>
                    <input
                      type="number"
                      value={editKpi}
                      onChange={(e) =>
                        setEditKpi(parseInt(e.target.value) || 100)
                      }
                      className="w-full px-2 py-1.5 rounded bg-white/10 text-sm focus:outline-none focus:ring-1 focus:ring-sidebar-active"
                    />
                  </div>

                  {/* 錯誤提示 */}
                  {editError && (
                    <p className="text-xs text-red-400">{editError}</p>
                  )}

                  {/* 儲存 / 取消 */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdate}
                      disabled={editSaving}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-sidebar-active text-white rounded text-sm hover:opacity-90 transition-colors disabled:opacity-50"
                    >
                      {editSaving ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      儲存
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={editSaving}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/10 text-white/70 rounded text-sm hover:bg-white/20 transition-colors disabled:opacity-50"
                    >
                      <X size={14} />
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-white/15 transition-colors ${
                    current?.id === p.id ? "bg-white/20 font-medium" : ""
                  }`}
                >
                  <button
                    onClick={() => {
                      setCurrent(p);
                      setDropdownOpen(false);
                      resetForm();
                      cancelEdit();
                    }}
                    className="flex-1 text-left truncate"
                  >
                    {p.name}
                  </button>
                  {current?.id === p.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(p);
                      }}
                      className="shrink-0 ml-2 text-white/40 hover:text-white/80 transition-colors"
                      title="編輯專案"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )
            )}

            {/* 新增專案按鈕 / 表單 */}
            {!showNewForm ? (
              <button
                onClick={() => setShowNewForm(true)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/15 transition-colors flex items-center gap-2 text-white/60 border-t border-white/10"
              >
                <Plus size={14} />
                新增專案
              </button>
            ) : (
              <div className="p-3 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/60 font-medium">
                    新增專案
                  </span>
                  <button
                    onClick={resetForm}
                    className="text-white/40 hover:text-white/80"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* 名稱 */}
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="專案名稱（如：倍速運動）"
                  className="w-full px-2 py-1.5 rounded bg-white/10 text-sm placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-sidebar-active"
                  autoFocus
                />

                {/* 平台選擇 */}
                <div>
                  <div className="text-xs text-white/50 mb-1">監控平台</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_PLATFORMS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => togglePlatform(p.value)}
                        className={`px-2 py-1 rounded text-xs transition-colors ${
                          newPlatforms.has(p.value)
                            ? "bg-sidebar-active text-white"
                            : "bg-white/10 text-white/60 hover:bg-white/20"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* KPI */}
                <div>
                  <div className="text-xs text-white/50 mb-1">
                    週目標 KPI
                  </div>
                  <input
                    type="number"
                    value={newKpi}
                    onChange={(e) =>
                      setNewKpi(parseInt(e.target.value) || 100)
                    }
                    className="w-full px-2 py-1.5 rounded bg-white/10 text-sm focus:outline-none focus:ring-1 focus:ring-sidebar-active"
                  />
                </div>

                {/* 錯誤提示 */}
                {error && (
                  <p className="text-xs text-red-400">{error}</p>
                )}

                {/* 建立按鈕 */}
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-sidebar-active text-white rounded text-sm hover:opacity-90 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  建立專案
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 導航欄 */}
      <nav className="flex-1 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-sidebar-active text-white font-medium"
                  : "hover:bg-white/10"
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* 底部資訊 */}
      <div className="p-4 border-t border-white/10 text-xs text-white/40">
        爆款對標系統 v1.0
      </div>
    </aside>
  );
}
