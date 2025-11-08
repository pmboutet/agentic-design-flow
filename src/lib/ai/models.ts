import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiModelConfig } from "@/types";

interface AiModelConfigRow {
  id: string;
  code: string;
  name: string;
  provider: string;
  model: string;
  base_url?: string | null;
  api_key_env_var: string;
  additional_headers?: Record<string, unknown> | null;
  is_default?: boolean | null;
  is_fallback?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Deepgram-specific columns
  deepgram_voice_agent_model?: string | null;
  deepgram_stt_model?: string | null;
  deepgram_tts_model?: string | null;
  deepgram_llm_provider?: string | null;
  // ElevenLabs-specific columns
  elevenlabs_voice_id?: string | null;
  elevenlabs_model_id?: string | null;
  elevenlabs_api_key_env_var?: string | null;
}

export function mapModelRow(row: AiModelConfigRow): AiModelConfig {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    provider: row.provider as AiModelConfig["provider"],
    model: row.model,
    baseUrl: row.base_url ?? null,
    apiKeyEnvVar: row.api_key_env_var,
    additionalHeaders: row.additional_headers ?? null,
    isDefault: Boolean(row.is_default),
    isFallback: Boolean(row.is_fallback),
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    // Map Deepgram columns from database
    deepgramLlmModel: row.deepgram_voice_agent_model ?? undefined,
    deepgramSttModel: row.deepgram_stt_model ?? undefined,
    deepgramTtsModel: row.deepgram_tts_model ?? undefined,
    deepgramLlmProvider: (row.deepgram_llm_provider as "anthropic" | "openai" | undefined) ?? undefined,
    // Map ElevenLabs columns from database
    elevenLabsVoiceId: row.elevenlabs_voice_id ?? undefined,
    elevenLabsModelId: row.elevenlabs_model_id ?? undefined,
    elevenLabsApiKeyEnvVar: row.elevenlabs_api_key_env_var ?? undefined,
  };
}

export async function fetchModelConfigById(
  supabase: SupabaseClient,
  id: string,
): Promise<AiModelConfig | null> {
  const { data, error } = await supabase
    .from("ai_model_configs")
    .select("*")
    .eq("id", id)
    .maybeSingle<AiModelConfigRow>();

  if (error) {
    throw error;
  }

  return data ? mapModelRow(data) : null;
}

export async function fetchModelConfigByCode(
  supabase: SupabaseClient,
  code: string,
): Promise<AiModelConfig | null> {
  const { data, error } = await supabase
    .from("ai_model_configs")
    .select("*")
    .eq("code", code)
    .maybeSingle<AiModelConfigRow>();

  if (error) {
    throw error;
  }

  return data ? mapModelRow(data) : null;
}

export async function listModelConfigs(
  supabase: SupabaseClient,
): Promise<AiModelConfig[]> {
  const { data, error } = await supabase
    .from("ai_model_configs")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapModelRow);
}
