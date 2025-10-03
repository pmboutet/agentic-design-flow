import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiAgentInteractionStatus, AiAgentLog } from "@/types";

interface AiAgentLogRow {
  id: string;
  agent_id?: string | null;
  model_config_id?: string | null;
  ask_session_id?: string | null;
  message_id?: string | null;
  interaction_type: string;
  request_payload: Record<string, unknown>;
  response_payload?: Record<string, unknown> | null;
  status: string;
  error_message?: string | null;
  latency_ms?: number | null;
  created_at: string;
}

function mapLogRow(row: AiAgentLogRow): AiAgentLog {
  return {
    id: row.id,
    agentId: row.agent_id ?? null,
    modelConfigId: row.model_config_id ?? null,
    askSessionId: row.ask_session_id ?? null,
    messageId: row.message_id ?? null,
    interactionType: row.interaction_type,
    requestPayload: row.request_payload ?? {},
    responsePayload: row.response_payload ?? null,
    status: row.status as AiAgentInteractionStatus,
    errorMessage: row.error_message ?? null,
    latencyMs: row.latency_ms ?? null,
    createdAt: row.created_at,
  };
}

export async function createAgentLog(
  supabase: SupabaseClient,
  payload: {
    agentId?: string | null;
    modelConfigId?: string | null;
    askSessionId?: string | null;
    messageId?: string | null;
    interactionType: string;
    requestPayload: Record<string, unknown>;
  }
): Promise<AiAgentLog> {
  const { data, error } = await supabase
    .from("ai_agent_logs")
    .insert({
      agent_id: payload.agentId ?? null,
      model_config_id: payload.modelConfigId ?? null,
      ask_session_id: payload.askSessionId ?? null,
      message_id: payload.messageId ?? null,
      interaction_type: payload.interactionType,
      request_payload: payload.requestPayload,
      status: "pending",
    })
    .select("*")
    .single<AiAgentLogRow>();

  if (error) {
    throw error;
  }

  return mapLogRow(data);
}

export async function markAgentLogProcessing(
  supabase: SupabaseClient,
  logId: string,
  payload: { modelConfigId?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("ai_agent_logs")
    .update({
      status: "processing",
      model_config_id: payload.modelConfigId ?? null,
    })
    .eq("id", logId);

  if (error) {
    throw error;
  }
}

export async function completeAgentLog(
  supabase: SupabaseClient,
  logId: string,
  payload: {
    responsePayload: Record<string, unknown>;
    latencyMs?: number;
  }
): Promise<void> {
  const { error } = await supabase
    .from("ai_agent_logs")
    .update({
      status: "completed",
      response_payload: payload.responsePayload,
      latency_ms: payload.latencyMs ?? null,
    })
    .eq("id", logId);

  if (error) {
    throw error;
  }
}

export async function failAgentLog(
  supabase: SupabaseClient,
  logId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from("ai_agent_logs")
    .update({
      status: "failed",
      error_message: errorMessage,
    })
    .eq("id", logId);

  if (error) {
    throw error;
  }
}

export async function listAgentLogs(
  supabase: SupabaseClient,
  options: { limit?: number }
): Promise<AiAgentLog[]> {
  const { data, error } = await supabase
    .from("ai_agent_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapLogRow);
}
