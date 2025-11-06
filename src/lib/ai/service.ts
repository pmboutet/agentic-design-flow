import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAgentBySlug } from "./agents";
import { renderTemplate } from "./templates";
import { callModelProvider, AiProviderError, type AiProviderResponse } from "./providers";
import { createAgentLog, markAgentLogProcessing, completeAgentLog, failAgentLog } from "./logs";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "./constants";
import type { AiAgentRecord, AiModelConfig } from "@/types";

type PromptOverride =
  | string
  | {
      template: string;
      render?: boolean;
      variables?: Record<string, string | null | undefined>;
    };

export interface ExecuteAgentOptions {
  supabase: SupabaseClient;
  agentSlug: string;
  askSessionId?: string | null;
  messageId?: string | null;
  interactionType: string;
  variables: Record<string, string | null | undefined>;
  maxOutputTokens?: number;
  temperature?: number;
  overridePrompts?: {
    system?: PromptOverride;
    user?: PromptOverride;
  };
}

export interface AgentExecutionResult {
  content: string;
  raw: Record<string, unknown>;
  logId: string;
  agent: AiAgentRecord;
  modelConfig: AiModelConfig;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildRequestPayload(agent: AiAgentRecord, prompts: { system: string; user: string }) {
  return {
    agentSlug: agent.slug,
    modelConfigId: agent.modelConfigId,
    fallbackModelConfigId: agent.fallbackModelConfigId,
    systemPrompt: prompts.system,
    userPrompt: prompts.user,
  } satisfies Record<string, unknown>;
}

function pickModelConfigs(agent: AiAgentRecord): AiModelConfig[] {
  const configs: AiModelConfig[] = [];
  if (agent.modelConfig) {
    configs.push(agent.modelConfig);
  }
  if (agent.fallbackModelConfig) {
    const isDuplicate = configs.some(config => config.id === agent.fallbackModelConfig!.id);
    if (!isDuplicate) {
      configs.push(agent.fallbackModelConfig);
    }
  }
  return configs;
}

async function ensureAgentHasModel(agent: AiAgentRecord): Promise<AiAgentRecord> {
  if (agent.modelConfigId && !agent.modelConfig) {
    throw new Error(`Agent ${agent.slug} is missing its primary model configuration`);
  }
  if (agent.fallbackModelConfigId && !agent.fallbackModelConfig) {
    throw new Error(`Agent ${agent.slug} is missing its fallback model configuration`);
  }
  if (!agent.modelConfig) {
    throw new Error(`Agent ${agent.slug} is not linked to any model configuration`);
  }
  return agent;
}

export async function executeAgent(options: ExecuteAgentOptions): Promise<AgentExecutionResult> {
  const agent = await fetchAgentBySlug(options.supabase, options.agentSlug, { includeModels: true });

  if (!agent) {
    throw new Error(`Unable to find AI agent with slug "${options.agentSlug}"`);
  }

  await ensureAgentHasModel(agent);

  const resolvePrompt = (override: PromptOverride | undefined, fallback: string): string => {
    if (!override) {
      return renderTemplate(fallback, options.variables);
    }

    if (typeof override === 'string') {
      return renderTemplate(override, options.variables);
    }

    const template = override.template;
    const vars = override.variables ?? options.variables;

    if (override.render === false) {
      return template;
    }

    return renderTemplate(template, vars);
  };

  const prompts = {
    system: resolvePrompt(options.overridePrompts?.system, agent.systemPrompt),
    user: resolvePrompt(options.overridePrompts?.user, agent.userPrompt),
  };

  // Payload optimisé pour le logging : on garde seulement les variables actives (available_variables)
  // Les prompts sont déjà résolus avec toutes les variables, mais on garde les variables brutes
  // pour référence/debug, en filtrant seulement celles qui sont déclarées comme disponibles
  const availableVariables = agent.availableVariables ?? [];
  const activeVariables: Record<string, string | undefined> = {};
  
  // Ajouter seulement les variables qui sont dans available_variables ET dans options.variables
  // On inclut ask_key seulement s'il est dans available_variables
  for (const varKey of availableVariables) {
    if (varKey in options.variables) {
      const value = options.variables[varKey];
      activeVariables[varKey] = value ?? undefined;
    }
  }
  
  // Toujours ajouter ask_key pour référence si présent dans options.variables
  // (même s'il n'est pas dans available_variables, c'est utile pour le debugging)
  if (options.variables.ask_key && !('ask_key' in activeVariables)) {
    activeVariables.ask_key = options.variables.ask_key ?? undefined;
  }

  const log = await createAgentLog(options.supabase, {
    agentId: agent.id,
    askSessionId: options.askSessionId ?? null,
    messageId: options.messageId ?? null,
    interactionType: options.interactionType,
    requestPayload: {
      ...buildRequestPayload(agent, prompts),
      // Variables actives sélectionnées (seulement celles dans available_variables)
      variables: activeVariables,
    },
  });

  const configs = pickModelConfigs(agent);

  if (configs.length === 0) {
    await failAgentLog(options.supabase, log.id, "No model configuration available");
    throw new Error(`No model configuration available for agent ${agent.slug}`);
  }

  const maxTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  let lastError: unknown = null;

  for (const config of configs) {
    await markAgentLogProcessing(options.supabase, log.id, { modelConfigId: config.id });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const started = Date.now();
        const response: AiProviderResponse = await callModelProvider(
          config,
          {
            systemPrompt: prompts.system,
            userPrompt: prompts.user,
            maxOutputTokens: maxTokens,
            temperature: options.temperature,
          },
        );
        const latency = Date.now() - started;

        await completeAgentLog(options.supabase, log.id, {
          responsePayload: response.raw,
          latencyMs: latency,
        });

        return {
          content: response.content,
          raw: response.raw,
          logId: log.id,
          agent,
          modelConfig: config,
        };
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await delay(3000);
        }
      }
    }
  }

  const message = lastError instanceof AiProviderError
    ? lastError.message
    : lastError instanceof Error
      ? lastError.message
      : "Unknown error while executing AI agent";

  await failAgentLog(options.supabase, log.id, message);

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(message);
}
