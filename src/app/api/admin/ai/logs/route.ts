import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import type { ApiResponse, AiAgentLog } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminSupabaseClient();
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const status = url.searchParams.get('status');
    const interactionType = url.searchParams.get('interactionType');

    let query = supabase
      .from("ai_agent_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (interactionType) {
      query = query.eq("interaction_type", interactionType);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const logs: AiAgentLog[] = (data ?? []).map((row: any) => ({
      id: row.id,
      agentId: row.agent_id,
      modelConfigId: row.model_config_id,
      askSessionId: row.ask_session_id,
      messageId: row.message_id,
      interactionType: row.interaction_type,
      requestPayload: row.request_payload || {},
      responsePayload: row.response_payload,
      status: row.status,
      errorMessage: row.error_message,
      latencyMs: row.latency_ms,
      createdAt: row.created_at,
    }));

    return NextResponse.json<ApiResponse<{ logs: AiAgentLog[]; total: number }>>({
      success: true,
      data: {
        logs,
        total: logs.length,
      }
    });

  } catch (error) {
    console.error('Error fetching AI logs:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch logs'
    }, { status: 500 });
  }
}