import { Platform, SourceType } from "./types";

export function platformLabel(p: Platform): string {
  const map: Record<Platform, string> = {
    douyin: "抖音",
    xiaohongshu: "小紅書",
    tiktok: "TikTok",
  };
  return map[p] ?? p;
}

export function platformIcon(p: Platform): string {
  const map: Record<Platform, string> = {
    douyin: "🎵",
    xiaohongshu: "📕",
    tiktok: "🎬",
  };
  return map[p] ?? "📱";
}

export function sourceLabel(s: SourceType): string {
  const map: Record<SourceType, string> = {
    keyword: "🎯 核心",
    account: "👤 帳號",
    ai_expand: "🤖 內容擴展",
    audience_expand: "👥 人群擴展",
  };
  return map[s] ?? s;
}

export function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "萬";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

export function getShootWeek(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const days = Math.floor((d.getTime() - oneJan.getTime()) / 86400000);
  const weekNum = Math.ceil((days + oneJan.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}
