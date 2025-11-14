import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiAgentRecord, AiModelConfig } from "@/types";
import { fetchModelConfigById } from "./models";

export interface AiAgentRow {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  model_config_id?: string | null;
  fallback_model_config_id?: string | null;
  system_prompt: string;
  user_prompt: string;
  available_variables?: string[] | null;
  metadata?: Record<string, unknown> | null;
  voice?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function sanitizePromptVariables(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const unique = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      continue;
    }

    unique.add(trimmed);
  }

  return Array.from(unique);
}

export function mapAgentRow(row: AiAgentRow): AiAgentRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    modelConfigId: row.model_config_id ?? null,
    voice: row.voice ?? false,
    fallbackModelConfigId: row.fallback_model_config_id ?? null,
    systemPrompt: row.system_prompt,
    userPrompt: row.user_prompt,
    availableVariables: row.available_variables ?? [],
    metadata: row.metadata ?? null,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export async function fetchAgentBySlug(
  supabase: SupabaseClient,
  slug: string,
  options: { includeModels?: boolean } = {},
): Promise<AiAgentRecord | null> {
  const { data, error } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<AiAgentRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const agent = mapAgentRow(data);

  if (options.includeModels) {
    const [modelConfig, fallbackConfig] = await Promise.all([
      agent.modelConfigId ? fetchModelConfigById(supabase, agent.modelConfigId) : Promise.resolve(null),
      agent.fallbackModelConfigId ? fetchModelConfigById(supabase, agent.fallbackModelConfigId) : Promise.resolve(null),
    ]);

    return {
      ...agent,
      modelConfig,
      fallbackModelConfig: fallbackConfig,
    } satisfies AiAgentRecord & {
      modelConfig?: AiModelConfig | null;
      fallbackModelConfig?: AiModelConfig | null;
    };
  }

  return agent;
}

export async function listAgents(
  supabase: SupabaseClient,
  options: { includeModels?: boolean } = {},
): Promise<AiAgentRecord[]> {
  const { data, error } = await supabase
    .from("ai_agents")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const mapped = (data ?? []).map(mapAgentRow);

  if (!options.includeModels) {
    return mapped;
  }

  const enriched = await Promise.all(
    mapped.map(async (agent) => {
      const [modelConfig, fallbackConfig] = await Promise.all([
        agent.modelConfigId ? fetchModelConfigById(supabase, agent.modelConfigId) : Promise.resolve(null),
        agent.fallbackModelConfigId ? fetchModelConfigById(supabase, agent.fallbackModelConfigId) : Promise.resolve(null),
      ]);

      return {
        ...agent,
        modelConfig,
        fallbackModelConfig: fallbackConfig,
      } satisfies AiAgentRecord & {
        modelConfig?: AiModelConfig | null;
        fallbackModelConfig?: AiModelConfig | null;
      };
    })
  );

  return enriched;
}
