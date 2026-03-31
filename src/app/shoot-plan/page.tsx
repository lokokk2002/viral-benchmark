"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { supabase } from "@/lib/supabase";
import { ShootPlan, ShootPlanContent } from "@/lib/types";
import { getShootWeek } from "@/lib/utils";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
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
  Camera,
  Clock,
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

  async function handleDownloadWord() {
    if (!plan) return;
    const content = plan.plan_content as ShootPlanContent | null;
    if (!content) return;

    const children: Paragraph[] = [];
    const videos = content.videos || [];

    // 標題
    children.push(
      new Paragraph({
        text: `拍攝計畫 — ${currentWeek}`,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    );

    if (content.total_duration_estimate) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "總預估拍攝時間：", bold: true }),
            new TextRun(content.total_duration_estimate),
          ],
          spacing: { after: 200 },
        })
      );
    }

    // v2: 每支影片詳細指引
    if (videos.length > 0) {
      videos.forEach((v) => {
        children.push(
          new Paragraph({
            text: `${v.order}. ${v.short_title}`,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 100 },
          })
        );
        if (v.original_title) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "原始標題：", bold: true, size: 20 }),
                new TextRun({ text: v.original_title, size: 20, color: "666666" }),
              ],
              spacing: { after: 80 },
            })
          );
        }
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "拍攝場景：", bold: true }),
              new TextRun(v.location),
            ],
            spacing: { after: 60 },
          })
        );
        if (v.location_detail) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "場景佈置：", bold: true }),
                new TextRun(v.location_detail),
              ],
              spacing: { after: 60 },
            })
          );
        }
        if (v.costumes.length > 0) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "服裝：", bold: true }),
                new TextRun(v.costumes.join("、")),
              ],
              spacing: { after: 60 },
            })
          );
        }
        if (v.props.length > 0) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "道具：", bold: true }),
                new TextRun(v.props.join("、")),
              ],
              spacing: { after: 60 },
            })
          );
        }
        if (v.key_shots.length > 0) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: "重點鏡頭：", bold: true })],
              spacing: { after: 40 },
            })
          );
          v.key_shots.forEach((shot, si) => {
            children.push(
              new Paragraph({
                text: `  ${si + 1}. ${shot}`,
                spacing: { after: 30 },
              })
            );
          });
        }
        if (v.duration_estimate) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "預估時間：", bold: true }),
                new TextRun(v.duration_estimate),
              ],
              spacing: { after: 60 },
            })
          );
        }
        if (v.notes) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "注意事項：", bold: true }),
                new TextRun(v.notes),
              ],
              spacing: { after: 100 },
            })
          );
        }
      });
    }

    // v1 fallback: 拍攝順序
    if (videos.length === 0 && content.shoot_order?.length) {
      children.push(
        new Paragraph({
          text: "建議拍攝順序",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 100 },
        })
      );
      content.shoot_order.forEach((s) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${s.order}. ${s.video_title}`, bold: true }),
              new TextRun(` — ${s.location}`),
            ],
            spacing: { after: 60 },
          })
        );
      });
    }

    // 設備清單
    if (content.equipment?.length) {
      children.push(
        new Paragraph({
          text: "攜帶設備",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 100 },
        })
      );
      content.equipment.forEach((e) => {
        children.push(
          new Paragraph({ text: `• ${e}`, spacing: { after: 40 } })
        );
      });
    }

    if (content.locations?.length) {
      children.push(
        new Paragraph({
          text: "場地總覽",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 100 },
        })
      );
      content.locations.forEach((loc) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: loc.name, bold: true }),
              new TextRun(`：${loc.videos.join("、")}`),
            ],
            spacing: { after: 60 },
          })
        );
      });
    }

    if (content.general_notes) {
      children.push(
        new Paragraph({
          text: "整體注意事項",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 100 },
        })
      );
      children.push(
        new Paragraph({ text: content.general_notes, spacing: { after: 100 } })
      );
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `拍攝計畫_${currentWeek}.docx`;
    a.click();
    URL.revokeObjectURL(url);
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
  const videos = content?.videos || [];
  const hasV2 = videos.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">拍攝計畫</h1>
          <p className="text-gray-500 text-sm">
            {currentWeek}
            {content?.total_duration_estimate && (
              <span className="ml-2">
                — 預估 {content.total_duration_estimate}
              </span>
            )}
            {plan.status === "confirmed" && (
              <span className="ml-2 text-success inline-flex items-center gap-1">
                <CheckCircle size={14} /> 已確認
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {content && (
            <button
              onClick={handleDownloadWord}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Download size={16} />
              下載 Word
            </button>
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
        <div className="space-y-6">
          {/* v2: 每支影片的拍攝指引 */}
          {hasV2 && (
            <div className="space-y-4">
              {videos.map((v, i) => (
                <section
                  key={i}
                  className="border border-border rounded-xl bg-card-bg overflow-hidden"
                >
                  <div className="p-4 border-b border-border bg-gray-50 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {v.order}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base">
                        {v.short_title}
                      </h3>
                      {v.original_title && (
                        <p className="text-xs text-gray-400 truncate">
                          {v.original_title}
                        </p>
                      )}
                    </div>
                    {v.duration_estimate && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                        <Clock size={12} />
                        {v.duration_estimate}
                      </span>
                    )}
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                        <MapPin size={12} /> 拍攝場景
                      </p>
                      <p className="text-sm font-medium">{v.location}</p>
                      {v.location_detail && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {v.location_detail}
                        </p>
                      )}
                    </div>
                    {v.costumes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                          <Shirt size={12} /> 服裝
                        </p>
                        <p className="text-sm">{v.costumes.join("、")}</p>
                      </div>
                    )}
                    {v.props.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                          <Wrench size={12} /> 道具
                        </p>
                        <p className="text-sm">{v.props.join("、")}</p>
                      </div>
                    )}
                    {v.key_shots.length > 0 && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                          <Camera size={12} /> 重點鏡頭
                        </p>
                        <ul className="space-y-1">
                          {v.key_shots.map((shot, si) => (
                            <li
                              key={si}
                              className="text-sm flex items-start gap-2"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                              {shot}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {v.notes && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-gray-500 mb-1">
                          注意事項
                        </p>
                        <p className="text-sm text-gray-600">{v.notes}</p>
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* 底部彙總 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="border border-border rounded-xl bg-card-bg">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <Wrench size={18} className="text-primary" />
                <h2 className="font-semibold">攜帶設備</h2>
              </div>
              <div className="p-4">
                {content.equipment?.length ? (
                  <ul className="space-y-1">
                    {content.equipment.map((e, i) => (
                      <li key={i} className="text-sm flex items-center gap-2">
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

            <section className="border border-border rounded-xl bg-card-bg">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <MapPin size={18} className="text-primary" />
                <h2 className="font-semibold">場地總覽</h2>
              </div>
              <div className="p-4 space-y-3">
                {content.locations?.map((loc, i) => (
                  <div key={i}>
                    <p className="font-medium text-sm">{loc.name}</p>
                    <p className="text-xs text-gray-400">
                      {loc.videos.join("、")}
                    </p>
                  </div>
                )) || <p className="text-sm text-gray-400">無資料</p>}
              </div>
            </section>
          </div>

          {content.general_notes && (
            <div className="border border-border rounded-xl bg-card-bg p-4">
              <p className="text-xs font-semibold text-gray-500 mb-1">
                整體注意事項
              </p>
              <p className="text-sm">{content.general_notes}</p>
            </div>
          )}

          {/* v1 fallback */}
          {!hasV2 && content.shoot_order && content.shoot_order.length > 0 && (
            <section className="border border-border rounded-xl bg-card-bg">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <ListOrdered size={18} className="text-primary" />
                <h2 className="font-semibold">建議拍攝順序</h2>
              </div>
              <div className="p-4">
                <ol className="space-y-2">
                  {content.shoot_order.map((s, i) => (
                    <li key={i} className="text-sm flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">
                        {s.order}
                      </span>
                      <div>
                        <p className="font-medium">{s.video_title}</p>
                        <p className="text-xs text-gray-400">{s.location}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-xl bg-card-bg p-6">
          <pre className="whitespace-pre-wrap text-sm">{plan.plan_raw}</pre>
        </div>
      )}
    </div>
  );
}
