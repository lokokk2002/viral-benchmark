"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { supabase } from "@/lib/supabase";
import { ShootPlan, ShootPlanContent } from "@/lib/types";
import { getShootWeek } from "@/lib/utils";
import {
  Download,
  Send,
  CheckCircle,
  MapPin,
  Shirt,
  Wrench,
  ListOrdered,
  FileText,
  Loader2,
} from "lucide-react";

export default function ShootPlanPage() {
  const { current } = useProject();
  const [plan, setPlan] = useState<ShootPlan | null>(null);
  const [loading, setLoading] = useState(false);

  const currentWeek = getShootWeek();

  const loadData = useCallback(async () => {
    if (!current) return;
    setLoading(true);

    const { data } = await supabase
      .from("vb_shoot_plans")
      .select("*")
      .eq("project_id", current.id)
      .eq("shoot_week", currentWeek)
      .order("created_at", { ascending: false })
      .limit(1);

    setPlan(data && data.length > 0 ? (data[0] as ShootPlan) : null);
    setLoading(false);
  }, [current, currentWeek]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleConfirm() {
    if (!plan) return;
    await supabase
      .from("vb_shoot_plans")
      .update({ status: "confirmed" })
      .eq("id", plan.id);
    setPlan({ ...plan, status: "confirmed" });
  }

  async function handleSlack() {
    if (!plan || !current) return;
    try {
      await fetch("/api/send-slack-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: current.id,
          plan_id: plan.id,
        }),
      });
      alert("已推送到 Slack");
    } catch {
      alert("推送失敗，請確認 Slack 是否已串接");
    }
  }

  if (!current) {
    return (
      <div className="p-8 text-center text-gray-400">請先選擇專案</div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Loader2 size={20} className="inline animate-spin mr-2" />
        載入中...
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">拍攝計畫</h1>
        <p className="text-gray-500 text-sm mb-6">{currentWeek}</p>
        <div className="border border-border rounded-xl bg-card-bg p-8 text-center text-gray-400">
          <FileText size={40} className="inline mb-3 opacity-40" />
          <p>本週尚無拍攝計畫</p>
          <p className="text-xs mt-1">
            請先到「本週拍攝表」完成腳本生成，再點擊「生成拍攝計畫」
          </p>
        </div>
      </div>
    );
  }

  const content = plan.plan_content as ShootPlanContent | null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">拍攝計畫</h1>
          <p className="text-gray-500 text-sm">
            {currentWeek}
            {plan.status === "confirmed" && (
              <span className="ml-2 text-success inline-flex items-center gap-1">
                <CheckCircle size={14} /> 已確認
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.pdf_url && (
            <a
              href={plan.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Download size={16} />
              下載 PDF
            </a>
          )}
          <button
            onClick={handleSlack}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            <Send size={16} />
            推送到 Slack
          </button>
          {plan.status !== "confirmed" && (
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-lg text-sm hover:opacity-90 transition-colors"
            >
              <CheckCircle size={16} />
              標記為已確認
            </button>
          )}
        </div>
      </div>

      {content ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* 拍攝地點清單 */}
          <section className="border border-border rounded-xl bg-card-bg">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <MapPin size={18} className="text-primary" />
              <h2 className="font-semibold">拍攝地點</h2>
            </div>
            <div className="p-4 space-y-3">
              {content.locations?.map((loc, i) => (
                <div key={i}>
                  <p className="font-medium text-sm">{loc.name}</p>
                  <p className="text-xs text-gray-400">
                    {loc.videos.join("、")}
                  </p>
                </div>
              )) || (
                <p className="text-sm text-gray-400">無資料</p>
              )}
            </div>
          </section>

          {/* 服裝需求 */}
          <section className="border border-border rounded-xl bg-card-bg">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Shirt size={18} className="text-primary" />
              <h2 className="font-semibold">服裝需求</h2>
            </div>
            <div className="p-4 space-y-3">
              {content.costumes?.map((c, i) => (
                <div key={i}>
                  <p className="font-medium text-sm">{c.video_title}</p>
                  <p className="text-xs text-gray-400">
                    {c.items.join("、")}
                  </p>
                </div>
              )) || (
                <p className="text-sm text-gray-400">無資料</p>
              )}
            </div>
          </section>

          {/* 設備清單 */}
          <section className="border border-border rounded-xl bg-card-bg">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Wrench size={18} className="text-primary" />
              <h2 className="font-semibold">攜帶設備</h2>
            </div>
            <div className="p-4">
              {content.equipment?.length ? (
                <ul className="space-y-1">
                  {content.equipment.map((e, i) => (
                    <li
                      key={i}
                      className="text-sm flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">無資料</p>
              )}
            </div>
          </section>

          {/* 拍攝順序 */}
          <section className="border border-border rounded-xl bg-card-bg">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <ListOrdered size={18} className="text-primary" />
              <h2 className="font-semibold">建議拍攝順序</h2>
            </div>
            <div className="p-4">
              {content.shoot_order?.length ? (
                <ol className="space-y-2">
                  {content.shoot_order.map((s, i) => (
                    <li
                      key={i}
                      className="text-sm flex items-center gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">
                        {s.order}
                      </span>
                      <div>
                        <p className="font-medium">{s.video_title}</p>
                        <p className="text-xs text-gray-400">
                          {s.location}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-gray-400">無資料</p>
              )}
            </div>
          </section>
        </div>
      ) : (
        /* 如果沒有結構化內容，顯示原始文字 */
        <div className="border border-border rounded-xl bg-card-bg p-6">
          <pre className="whitespace-pre-wrap text-sm">{plan.plan_raw}</pre>
        </div>
      )}
    </div>
  );
}
