import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiAgentRecord, AiModelConfig } from '@/types';

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
  let result = template;
  
  // Replace all template variables with their values
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined && value !== null) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }
  }
  
  return result;
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
    .maybeSingle<AiModelConfig>();

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

  return data;
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
    .maybeSingle<AiModelConfig>();

  if (error) {
    console.warn(`Failed to fetch fallback model config: ${error.message}`);
    return null;
  }

  return data;
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
      let agentQuery = supabase.from('ai_agents').select(`
        *,
        model_configs!ai_agents_model_config_id_fkey(*),
        fallback_model_configs!ai_agents_fallback_model_config_id_fkey(*)
      `);

      if (agentId) {
        agentQuery = agentQuery.eq('id', agentId);
      } else if (agentSlug) {
        agentQuery = agentQuery.eq('slug', agentSlug);
      }

      const { data: agentData, error: agentError } = await agentQuery.maybeSingle();

      if (agentError) {
        console.warn(`Failed to fetch agent: ${agentError.message}`);
      } else if (agentData) {
        agent = agentData as AiAgentRecord;
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

  // Priority 5: Default Fallback
  const defaultSystemPrompt = `Tu es un facilitateur de conversation expérimenté. Ton rôle est d'aider les participants à explorer leurs défis, partager leurs expériences et générer des insights collectifs. 

Tu dois :
- Écouter activement et poser des questions pertinentes
- Aider à clarifier les problèmes et défis
- Encourager le partage d'expériences
- Faire émerger des solutions et insights
- Maintenir un ton professionnel mais accessible

Réponds de manière concise et engageante.`;

  const systemPrompt = substitutePromptVariables(defaultSystemPrompt, variables || {});
  const modelConfig = await getDefaultModelConfig(supabase);
  const fallbackModelConfig = await getFallbackModelConfig(supabase);
  
  return {
    systemPrompt,
    modelConfig,
    fallbackModelConfig: fallbackModelConfig || undefined,
  };
}
