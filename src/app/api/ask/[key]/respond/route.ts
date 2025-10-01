import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/types";
import { isValidAskKey, parseErrorMessage } from "@/lib/utils";

export async function POST(
  _request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const { key } = params;

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Invalid ASK key format"
      }, { status: 400 });
    }

    const externalWebhook = process.env.EXTERNAL_RESPONSE_WEBHOOK;

    if (!externalWebhook) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "External webhook not configured"
      }, { status: 500 });
    }

    const response = await fetch(externalWebhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Source": "agentic-design-flow",
        "X-Request-Type": "trigger-response"
      },
      body: JSON.stringify({
        askKey: key,
        action: "trigger_ai_response",
        triggeredAt: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`External webhook responded with status ${response.status}`);
    }

    return NextResponse.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error("Error triggering AI response:", error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
