import { NextRequest, NextResponse } from "next/server";

// 觸發 n8n Workflow 3：拍攝計畫彙整
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { project_id, shoot_week } = body;

  const n8nWebhookUrl = process.env.N8N_WEBHOOK_SHOOT_PLAN;
  if (!n8nWebhookUrl) {
    return NextResponse.json(
      { error: "N8N_WEBHOOK_SHOOT_PLAN not configured" },
      { status: 500 }
    );
  }

  const res = await fetch(n8nWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id, shoot_week }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "n8n webhook failed" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
