import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// POST /api/sync-thresholds
// 專案平台更新後，同步建立缺少的門檻
export async function POST(request: NextRequest) {
  const { project_id, platforms } = await request.json();

  if (!project_id || !platforms?.length) {
    return NextResponse.json({ error: "project_id and platforms required" }, { status: 400 });
  }

  // 查現有門檻
  const { data: existing } = await supabase
    .from("vb_thresholds")
    .select("platform")
    .eq("project_id", project_id);

  const existingSet = new Set((existing || []).map((t: any) => t.platform));
  const toAdd = platforms.filter((p: string) => !existingSet.has(p));

  if (toAdd.length > 0) {
    const rows = toAdd.map((platform: string) => ({
      project_id,
      platform,
      min_likes: 10000,
      min_shares: 0,
      max_days_old: 30,
    }));
    await supabase.from("vb_thresholds").insert(rows);
  }

  // 刪除已移除平台的門檻
  const toRemove = [...existingSet].filter((p) => !platforms.includes(p));
  if (toRemove.length > 0) {
    await supabase
      .from("vb_thresholds")
      .delete()
      .eq("project_id", project_id)
      .in("platform", toRemove);
  }

  return NextResponse.json({
    success: true,
    added: toAdd,
    removed: toRemove,
  });
}
