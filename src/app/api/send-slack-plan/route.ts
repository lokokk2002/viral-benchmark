import { NextRequest, NextResponse } from "next/server";

// 推送拍攝計畫到 Slack
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project_id, plan_id } = body;

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_SLACK_PLAN;
    if (!n8nWebhookUrl) {
      return NextResponse.json(
        { error: "N8N_WEBHOOK_SLACK_PLAN not configured" },
        { status: 500 }
      );
    }

    const res = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id, plan_id }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "n8n webhook failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Send Slack plan failed" },
      { status: 500 }
    );
  }
}
