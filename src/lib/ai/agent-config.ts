import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiAgentRecord, AiModelConfig } from '@/types';
import { renderTemplate } from './templates';
import { mapModelRow } from './models';

interface RelatedPromptHolder {
  id: string;
  name?: string | null;
  system_prompt?: string | null;
}

interface AskSessionWithRelations {
  id: string;
  ask_key: string;
  question: string;
  description?: string | null;
  system_prompt?: string | null;
  ai_config?: Record<string, unknown> | null;
  project_id?: string | null;
  challenge_id?: string | null;
  delivery_mode?: string | null;
  audience_scope?: string | null;
  response_mode?: string | null;
  projects?: RelatedPromptHolder | RelatedPromptHolder[] | null;
  challenges?: RelatedPromptHolder | RelatedPromptHolder[] | null;
}

type ModelRow = Parameters<typeof mapModelRow>[0];

interface AgentQueryRow {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  system_prompt: string;
  user_prompt?: string | null;
  available_variables?: string[] | null;
  metadata?: Record<string, unknown> | null;
  model_config_id?: string | null;
  fallback_model_config_id?: string | null;
  model_config?: ModelRow | null;
  fallback_model_config?: ModelRow | null;
}

export const DEFAULT_CHAT_AGENT_SLUG = 'ask-conversation-response';

function mapAgentRow(row: AgentQueryRow): AiAgentRecord {
  const modelConfig = row.model_config ? mapModelRow(row.model_config) : null;
  const fallbackModelConfig = row.fallback_model_config ? mapModelRow(row.fallback_model_config) : null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    modelConfigId: row.model_config_id ?? null,
    fallbackModelConfigId: row.fallback_model_config_id ?? null,
    systemPrompt: row.system_prompt,
    userPrompt: row.user_prompt ?? '',
    availableVariables: Array.isArray(row.available_variables) ? row.available_variables : [],
    metadata: row.metadata ?? null,
    modelConfig,
    fallbackModelConfig,
  };
}

async function fetchAgentByIdOrSlug(
  supabase: SupabaseClient,
  options: { id?: string | null; slug?: string | null }
): Promise<AiAgentRecord | null> {
  let query = supabase.from('ai_agents').select(`
    *,
    model_config:ai_model_configs!model_config_id(*),
    fallback_model_config:ai_model_configs!fallback_model_config_id(*)
  `);

  if (options.id) {
    query = query.eq('id', options.id);
  }

  if (options.slug) {
    query = query.eq('slug', options.slug);
  }

  const { data, error } = await query.maybeSingle<AgentQueryRow>();

  if (error) {
    console.warn(`Failed to fetch agent (${options.id ?? options.slug ?? 'unknown'}): ${error.message}`);
    return null;
  }

  if (!data) {
    return null;
  }

  return mapAgentRow(data);
}

async function fetchAgentBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<AiAgentRecord | null> {
  return fetchAgentByIdOrSlug(supabase, { slug });
}

export async function getChatAgentConfig(
  supabase: SupabaseClient,
  variables: PromptVariables = {}
): Promise<AgentConfigResult> {
  const agent = await fetchAgentBySlug(supabase, DEFAULT_CHAT_AGENT_SLUG);

  if (!agent) {
    throw new Error(`Chat agent configuration "${DEFAULT_CHAT_AGENT_SLUG}" not found`);
  }

  const trimmedSystemPrompt = agent.systemPrompt?.trim() ?? '';
  if (!trimmedSystemPrompt) {
    throw new Error(`Chat agent "${DEFAULT_CHAT_AGENT_SLUG}" is missing a system prompt`);
  }

  const trimmedUserPrompt = agent.userPrompt?.trim() ?? '';
  if (!trimmedUserPrompt) {
    throw new Error(`Chat agent "${DEFAULT_CHAT_AGENT_SLUG}" is missing a user prompt`);
  }

  const systemPrompt = substitutePromptVariables(trimmedSystemPrompt, variables);
  const userPrompt = substitutePromptVariables(trimmedUserPrompt, variables);

  const modelConfig = agent.modelConfig ?? await getDefaultModelConfig(supabase);
  const fallbackModelConfig = agent.fallbackModelConfig ?? await getFallbackModelConfig(supabase);

  return {
    systemPrompt,
    userPrompt,
    modelConfig,
    fallbackModelConfig: fallbackModelConfig ?? undefined,
    agent,
  };
}

export interface AgentConfigResult {
  systemPrompt: string;
  userPrompt?: string;
  modelConfig: AiModelConfig;
  fallbackModelConfig?: AiModelConfig;
  agent?: AiAgentRecord;
}

export interface PromptVariables {
  ask_question?: string;
  ask_description?: string;
  participant_name?: string;
  participant_role?: string;
  project_name?: string;
  challenge_name?: string;
  previous_messages?: string;
  delivery_mode?: string;
  audience_scope?: string;
  response_mode?: string;
  [key: string]: string | undefined;
}

/**
 * Substitute template variables in a prompt string
 */
export function substitutePromptVariables(
  template: string,
  variables: PromptVariables
): string {
  return renderTemplate(template, variables);
}

/**
 * Get default model configuration
 */
export async function getDefaultModelConfig(
  supabase: SupabaseClient
): Promise<AiModelConfig> {
  const { data, error } = await supabase
    .from('ai_model_configs')
    .select('*')
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch default model config: ${error.message}`);
  }

  if (!data) {
    // Fallback to a hardcoded default if no default is configured
    return {
      id: crypto.randomUUID(),
      code: 'anthropic-claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      baseUrl: 'https://api.anthropic.com/v1',
      additionalHeaders: {},
      isDefault: true,
      isFallback: false,
    };
  }

  const mappedData = mapModelRow(data);
  return mappedData;
}

/**
 * Get fallback model configuration
 */
export async function getFallbackModelConfig(
  supabase: SupabaseClient
): Promise<AiModelConfig | null> {
  const { data, error } = await supabase
    .from('ai_model_configs')
    .select('*')
    .eq('is_fallback', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`Failed to fetch fallback model config: ${error.message}`);
    return null;
  }

  return data ? mapModelRow(data) : null;
}

/**
 * Retrieve the agent configuration for an ASK session
 * Handles priority resolution and template variable substitution
 */
export async function getAgentConfigForAsk(
  supabase: SupabaseClient,
  askSessionId: string,
  variables?: PromptVariables
): Promise<AgentConfigResult> {
  // First, get the ASK session with its configuration
  const { data: askSession, error: askError } = await supabase
    .from('ask_sessions')
    .select(`
      id,
      ask_key,
      question,
      description,
      system_prompt,
      ai_config,
      project_id,
      challenge_id,
      delivery_mode,
      audience_scope,
      response_mode,
      projects(id, name, system_prompt),
      challenges(id, name, system_prompt)
    `)
    .eq('id', askSessionId)
    .maybeSingle<AskSessionWithRelations>();

  if (askError) {
    throw new Error(`Failed to fetch ASK session: ${askError.message}`);
  }

  if (!askSession) {
    throw new Error('ASK session not found');
  }

  // Priority 1: Ask Session Override
  if (askSession.system_prompt) {
    const systemPrompt = substitutePromptVariables(askSession.system_prompt, variables || {});
    const modelConfig = await getDefaultModelConfig(supabase);
    const fallbackModelConfig = await getFallbackModelConfig(supabase);
    
    return {
      systemPrompt,
      modelConfig,
      fallbackModelConfig: fallbackModelConfig || undefined,
    };
  }

  // Priority 2: Agent Configuration
  let agent: AiAgentRecord | null = null;
  
  // Check if ai_config contains agent reference
  if (askSession.ai_config && typeof askSession.ai_config === 'object') {
    const aiConfig = askSession.ai_config as any;
    const agentId = aiConfig.agent_id;
    const agentSlug = aiConfig.agent_slug;

    if (agentId || agentSlug) {
      const agentRecord = await fetchAgentByIdOrSlug(supabase, {
        id: agentId ?? null,
        slug: agentSlug ?? null,
      });

      if (agentRecord) {
        agent = agentRecord;
      }
    }
  }

  if (agent) {
    const systemPrompt = substitutePromptVariables(agent.systemPrompt, variables || {});
    const userPrompt = agent.userPrompt ? substitutePromptVariables(agent.userPrompt, variables || {}) : undefined;
    
    return {
      systemPrompt,
      userPrompt,
      modelConfig: agent.modelConfig || await getDefaultModelConfig(supabase),
      fallbackModelConfig: agent.fallbackModelConfig || await getFallbackModelConfig(supabase) || undefined,
      agent,
    };
  }

  const projectFromRelation = Array.isArray(askSession.projects)
    ? askSession.projects[0] ?? null
    : askSession.projects ?? null;

  const challengeFromRelation = Array.isArray(askSession.challenges)
    ? askSession.challenges[0] ?? null
    : askSession.challenges ?? null;

  // Priority 3: Project Level
  if (askSession.project_id && projectFromRelation?.system_prompt) {
    const systemPrompt = substitutePromptVariables(projectFromRelation.system_prompt, variables || {});
    const modelConfig = await getDefaultModelConfig(supabase);
    const fallbackModelConfig = await getFallbackModelConfig(supabase);
    
    return {
      systemPrompt,
      modelConfig,
      fallbackModelConfig: fallbackModelConfig || undefined,
    };
  }

  // Priority 4: Challenge Level
  if (askSession.challenge_id && challengeFromRelation?.system_prompt) {
    const systemPrompt = substitutePromptVariables(challengeFromRelation.system_prompt, variables || {});
    const modelConfig = await getDefaultModelConfig(supabase);
    const fallbackModelConfig = await getFallbackModelConfig(supabase);
    
    return {
      systemPrompt,
      modelConfig,
      fallbackModelConfig: fallbackModelConfig || undefined,
    };
  }

  // Priority 5: Default chat agent fallback
  return getChatAgentConfig(supabase, variables || {});
}
