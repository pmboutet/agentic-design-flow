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
  enable_thinking?: boolean | null;
  thinking_budget_tokens?: number | null;
  // Voice agent provider selector
  voice_agent_provider?: string | null;
  // Deepgram-specific columns
  deepgram_voice_agent_model?: string | null;
  deepgram_stt_model?: string | null;
  deepgram_tts_model?: string | null;
  deepgram_llm_provider?: string | null;
  // Speechmatics-specific columns
  speechmatics_stt_language?: string | null;
  speechmatics_stt_operating_point?: string | null;
  speechmatics_stt_max_delay?: number | null;
  speechmatics_stt_enable_partials?: boolean | null;
  speechmatics_llm_provider?: string | null;
  speechmatics_llm_model?: string | null;
  speechmatics_api_key_env_var?: string | null;
  // Speechmatics diarization columns
  speechmatics_diarization?: string | null;
  speechmatics_speaker_sensitivity?: number | null;
  speechmatics_prefer_current_speaker?: boolean | null;
  speechmatics_max_speakers?: number | null;
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
    enableThinking: row.enable_thinking ?? undefined,
    thinkingBudgetTokens: row.thinking_budget_tokens ?? undefined,
    // Map voice agent provider selector
    voiceAgentProvider: (row.voice_agent_provider as "deepgram-voice-agent" | "speechmatics-voice-agent" | undefined) ?? undefined,
    // Map Deepgram columns from database
    deepgramLlmModel: row.deepgram_voice_agent_model ?? undefined,
    deepgramSttModel: row.deepgram_stt_model ?? undefined,
    deepgramTtsModel: row.deepgram_tts_model ?? undefined,
    deepgramLlmProvider: (row.deepgram_llm_provider as "anthropic" | "openai" | undefined) ?? undefined,
    // Map Speechmatics columns from database
    speechmaticsSttLanguage: row.speechmatics_stt_language ?? undefined,
    speechmaticsSttOperatingPoint: (row.speechmatics_stt_operating_point as "enhanced" | "standard" | undefined) ?? undefined,
    speechmaticsSttMaxDelay: row.speechmatics_stt_max_delay ?? undefined,
    speechmaticsSttEnablePartials: row.speechmatics_stt_enable_partials ?? undefined,
    speechmaticsLlmProvider: (row.speechmatics_llm_provider as "anthropic" | "openai" | undefined) ?? undefined,
    speechmaticsLlmModel: row.speechmatics_llm_model ?? undefined,
    speechmaticsApiKeyEnvVar: row.speechmatics_api_key_env_var ?? undefined,
    // Map Speechmatics diarization columns from database
    speechmaticsDiarization: (row.speechmatics_diarization as "none" | "speaker" | "channel" | "channel_and_speaker" | undefined) ?? undefined,
    speechmaticsSpeakerSensitivity: row.speechmatics_speaker_sensitivity ?? undefined,
    speechmaticsPreferCurrentSpeaker: row.speechmatics_prefer_current_speaker ?? undefined,
    speechmaticsMaxSpeakers: row.speechmatics_max_speakers ?? undefined,
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
