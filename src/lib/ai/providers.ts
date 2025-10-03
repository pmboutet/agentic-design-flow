import { DEFAULT_MAX_OUTPUT_TOKENS } from "./constants";
import type { AiModelConfig } from "@/types";

export interface AiProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiProviderResponse {
  content: string;
  raw: Record<string, unknown>;
}

export class AiProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AiProviderError";
  }
}

function resolveApiKey(config: AiModelConfig): string {
  const key = process.env[config.apiKeyEnvVar];
  if (!key) {
    throw new AiProviderError(
      `Missing API key for model ${config.code}. Define environment variable ${config.apiKeyEnvVar}.`
    );
  }
  return key;
}

function normaliseBaseUrl(config: AiModelConfig, fallback: string): string {
  if (config.baseUrl) {
    return config.baseUrl.replace(/\/$/, "");
  }
  return fallback;
}

async function callAnthropic(
  config: AiModelConfig,
  request: AiProviderRequest,
  abortSignal?: AbortSignal,
): Promise<AiProviderResponse> {
  const apiKey = resolveApiKey(config);
  const baseUrl = normaliseBaseUrl(config, "https://api.anthropic.com/v1");
  const url = `${baseUrl}/messages`;

  const body = {
    model: config.model,
    max_output_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    system: request.systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: request.userPrompt,
          },
        ],
      },
    ],
  } satisfies Record<string, unknown>;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  if (config.additionalHeaders) {
    for (const [key, value] of Object.entries(config.additionalHeaders)) {
      if (typeof value === "string") {
        headers[key] = value;
      }
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  const raw = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AiProviderError(
      `Anthropic API error (${response.status}): ${raw?.error?.message ?? response.statusText}`,
      raw,
    );
  }

  const contentBlocks = Array.isArray((raw as any)?.content) ? (raw as any).content : [];
  const text = contentBlocks
    .map((block: any) => {
      if (!block) return "";
      if (typeof block === "string") return block;
      if (typeof block.text === "string") return block.text;
      if (Array.isArray(block.content)) {
        return block.content
          .map((inner: any) => (typeof inner?.text === "string" ? inner.text : ""))
          .join("");
      }
      return "";
    })
    .join("")
    .trim();

  return {
    content: text,
    raw: raw as Record<string, unknown>,
  };
}

async function callMistral(
  config: AiModelConfig,
  request: AiProviderRequest,
  abortSignal?: AbortSignal,
): Promise<AiProviderResponse> {
  const apiKey = resolveApiKey(config);
  const baseUrl = normaliseBaseUrl(config, "https://api.mistral.ai/v1");
  const url = `${baseUrl}/chat/completions`;

  const body = {
    model: config.model,
    temperature: request.temperature ?? 0.2,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt },
    ],
    max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  } satisfies Record<string, unknown>;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (config.additionalHeaders) {
    for (const [key, value] of Object.entries(config.additionalHeaders)) {
      if (typeof value === "string") {
        headers[key] = value;
      }
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  const raw = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AiProviderError(
      `Mistral API error (${response.status}): ${raw?.error?.message ?? response.statusText}`,
      raw,
    );
  }

  const choices = Array.isArray((raw as any)?.choices) ? (raw as any).choices : [];
  const text = choices
    .map((choice: any) => choice?.message?.content ?? "")
    .join("\n")
    .trim();

  return {
    content: text,
    raw: raw as Record<string, unknown>,
  };
}

async function callOpenAiCompatible(
  config: AiModelConfig,
  request: AiProviderRequest,
  abortSignal?: AbortSignal,
): Promise<AiProviderResponse> {
  const apiKey = resolveApiKey(config);
  const baseUrl = normaliseBaseUrl(config, "https://api.openai.com/v1");
  const url = `${baseUrl}/chat/completions`;

  const body = {
    model: config.model,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt },
    ],
    max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  } satisfies Record<string, unknown>;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (config.additionalHeaders) {
    for (const [key, value] of Object.entries(config.additionalHeaders)) {
      if (typeof value === "string") {
        headers[key] = value;
      }
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  const raw = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AiProviderError(
      `OpenAI compatible API error (${response.status}): ${raw?.error?.message ?? response.statusText}`,
      raw,
    );
  }

  const choices = Array.isArray((raw as any)?.choices) ? (raw as any).choices : [];
  const text = choices
    .map((choice: any) => choice?.message?.content ?? "")
    .join("\n")
    .trim();

  return {
    content: text,
    raw: raw as Record<string, unknown>,
  };
}

export async function callModelProvider(
  config: AiModelConfig,
  request: AiProviderRequest,
  abortSignal?: AbortSignal,
): Promise<AiProviderResponse> {
  switch (config.provider) {
    case "anthropic":
      return callAnthropic(config, request, abortSignal);
    case "mistral":
      return callMistral(config, request, abortSignal);
    case "openai":
    case "custom":
      return callOpenAiCompatible(config, request, abortSignal);
    default:
      throw new AiProviderError(`Unsupported AI provider: ${config.provider}`);
  }
}
