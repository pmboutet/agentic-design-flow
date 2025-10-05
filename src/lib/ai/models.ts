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
