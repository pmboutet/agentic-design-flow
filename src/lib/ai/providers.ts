import { GoogleAuth } from "google-auth-library";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "./constants";
import type { AiModelConfig } from "@/types";

export interface AiToolDefinition {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AiProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  tools?: AiToolDefinition[];
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

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
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
  };

  if (typeof request.temperature === "number") {
    body.temperature = request.temperature;
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools;
  }

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

type VertexToolCallState = {
  id?: string;
  name?: string;
  inputChunks: string[];
};

interface VertexStreamResult {
  text: string;
  events: unknown[];
  stopReason?: string;
  toolCalls: Array<{
    id?: string;
    name?: string;
    input: unknown;
    rawInput: string;
  }>;
  usage?: unknown;
}

function parseJsonSafely(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function ensureVertexBaseUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    const trimmedPath = parsed.pathname.replace(/\/$/, "");
    const versionMatch = trimmedPath.match(/^\/(v\d+(beta\d+)?)/i);

    if (versionMatch && versionMatch[1]) {
      parsed.pathname = `/${versionMatch[1]}`;
    } else {
      parsed.pathname = "/v1";
    }

    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    const trimmed = baseUrl.replace(/\/$/, "");
    const fallbackMatch = trimmed.match(/\/(v\d+(beta\d+)?)(?:\/|$)/i);
    if (fallbackMatch && fallbackMatch.index !== undefined) {
      return trimmed.slice(0, fallbackMatch.index + fallbackMatch[0].length).replace(/\/$/, "");
    }
    return `${trimmed}/v1`;
  }
}

function extractFromAdditionalHeaders(
  config: AiModelConfig,
  key: string,
): string | null {
  if (!config.additionalHeaders || typeof config.additionalHeaders !== "object") {
    return null;
  }

  const value = (config.additionalHeaders as Record<string, unknown>)[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function resolveVertexProjectId(
  config: AiModelConfig,
  credentials: Record<string, unknown>,
): string {
  const fromHeaders =
    extractFromAdditionalHeaders(config, "projectId") ??
    extractFromAdditionalHeaders(config, "project_id");

  if (fromHeaders) {
    return fromHeaders;
  }

  const fromCredentials = credentials.project_id;

  if (typeof fromCredentials === "string" && fromCredentials.trim().length > 0) {
    return fromCredentials.trim();
  }

  throw new AiProviderError(
    `Missing Vertex AI project ID for model ${config.code}. Provide projectId in additional headers or ensure the service account JSON includes project_id.`,
  );
}

function parseLocationFromBaseUrl(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    const hostMatch = url.hostname.match(/^([a-z0-9-]+)-aiplatform\.googleapis\.com$/i);
    if (hostMatch && hostMatch[1]) {
      return hostMatch[1];
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const locationIndex = segments.indexOf("locations");
    if (locationIndex >= 0 && segments[locationIndex + 1]) {
      return segments[locationIndex + 1];
    }
  } catch {
    return null;
  }

  return null;
}

function resolveVertexLocation(config: AiModelConfig): string {
  const fromHeaders = extractFromAdditionalHeaders(config, "location");
  if (fromHeaders) {
    return fromHeaders;
  }

  const fromBaseUrl = parseLocationFromBaseUrl(config.baseUrl);
  if (fromBaseUrl) {
    return fromBaseUrl;
  }

  return "us-central1";
}

async function parseVertexStream(response: Response): Promise<VertexStreamResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new AiProviderError("Vertex AI streaming response has no body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const events: unknown[] = [];
  const toolState = new Map<number, VertexToolCallState>();
  const toolCalls: VertexStreamResult["toolCalls"] = [];
  let text = "";
  let stopReason: string | undefined;
  let usage: unknown;
  let streamClosed = false;

  const processEvent = (rawEvent: string): void => {
    const normalised = rawEvent.replace(/\r/g, "");
    const lines = normalised.split("\n");
    const dataLines = lines
      .map(line => line.trim())
      .filter(line => line.startsWith("data:"));

    if (dataLines.length === 0) {
      return;
    }

    const payload = dataLines
      .map(line => line.slice("data:".length).trim())
      .join("")
      .trim();

    if (!payload) {
      return;
    }

    if (payload === "[DONE]") {
      streamClosed = true;
      return;
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(payload);
      events.push(parsed);
    } catch {
      events.push({ type: "unparsed", raw: payload });
      return;
    }

    const type = parsed?.type;

    switch (type) {
      case "content_block_start": {
        const index = parsed?.index;
        if (typeof index === "number" && parsed?.content_block?.type === "tool_use") {
          toolState.set(index, {
            id: parsed.content_block.id,
            name: parsed.content_block.name,
            inputChunks: [],
          });
        }
        break;
      }
      case "content_block_delta": {
        const index = parsed?.index;
        const delta = parsed?.delta;
        if (!delta) {
          break;
        }

        if (delta.type === "text_delta" && typeof delta.text === "string") {
          text += delta.text;
        } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
          if (typeof index === "number") {
            const state = toolState.get(index);
            if (state) {
              state.inputChunks.push(delta.partial_json);
            }
          }
        }
        break;
      }
      case "content_block_stop": {
        const index = parsed?.index;
        if (typeof index === "number") {
          const state = toolState.get(index);
          if (state) {
            const rawInput = state.inputChunks.join("");
            const parsedInput = rawInput ? parseJsonSafely(rawInput) ?? rawInput : {};
            toolCalls.push({
              id: state.id,
              name: state.name,
              input: parsedInput,
              rawInput,
            });
            toolState.delete(index);
          }
        }
        break;
      }
      case "message_delta": {
        if (parsed?.delta?.stop_reason) {
          stopReason = parsed.delta.stop_reason as string;
        }
        if (parsed?.usage) {
          usage = parsed.usage;
        }
        break;
      }
      case "message_stop": {
        if (parsed?.stop_reason) {
          stopReason = parsed.stop_reason as string;
        }
        break;
      }
      case "error": {
        const errorMessage = parsed?.error?.message ?? "Unknown Vertex AI streaming error";
        throw new AiProviderError(errorMessage, parsed);
      }
      default: {
        if (type === "content_block" && typeof parsed?.content?.text === "string") {
          text += parsed.content.text;
        }
        break;
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const eventChunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (eventChunk.trim().length > 0) {
        processEvent(eventChunk);
      }
      if (streamClosed) {
        break;
      }
      boundary = buffer.indexOf("\n\n");
    }

    if (streamClosed) {
      break;
    }
  }

  if (!streamClosed) {
    buffer += decoder.decode();
    const remaining = buffer.trim();
    if (remaining.length > 0) {
      processEvent(remaining);
    }
  }

  return {
    text: text.trim(),
    events,
    stopReason,
    toolCalls,
    usage,
  };
}

async function callVertexAnthropic(
  config: AiModelConfig,
  request: AiProviderRequest,
  abortSignal?: AbortSignal,
): Promise<AiProviderResponse> {
  const credentialsJson = resolveApiKey(config);
  let credentials: Record<string, unknown>;

  try {
    credentials = JSON.parse(credentialsJson);
  } catch (error) {
    throw new AiProviderError(
      `Invalid Google service account JSON in environment variable ${config.apiKeyEnvVar}`,
      error,
    );
  }

  const auth = new GoogleAuth({
    credentials: credentials as any,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  if (!accessToken) {
    throw new AiProviderError("Unable to obtain access token for Vertex AI");
  }

  const location = resolveVertexLocation(config);
  const projectId = resolveVertexProjectId(config, credentials);

  const fallbackBaseUrl = `https://${location}-aiplatform.googleapis.com/v1`;
  const baseUrl = ensureVertexBaseUrl(config.baseUrl ? config.baseUrl : fallbackBaseUrl);
  const url = `${baseUrl}/projects/${projectId}/locations/${location}/publishers/anthropic/models/${config.model}:streamGenerateContent`;

  const body: Record<string, unknown> = {
    anthropic_version: "2023-06-01",
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
  };

  if (typeof request.temperature === "number") {
    body.temperature = request.temperature;
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => null);
    throw new AiProviderError(
      `Vertex AI streaming error (${response.status}): ${errorText ?? response.statusText}`,
    );
  }

  const streamResult = await parseVertexStream(response);

  return {
    content: streamResult.text,
    raw: {
      events: streamResult.events,
      stopReason: streamResult.stopReason,
      toolCalls: streamResult.toolCalls,
      usage: streamResult.usage,
    },
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
    case "vertex_anthropic":
      return callVertexAnthropic(config, request, abortSignal);
    case "mistral":
      return callMistral(config, request, abortSignal);
    case "openai":
    case "custom":
      return callOpenAiCompatible(config, request, abortSignal);
    default:
      throw new AiProviderError(`Unsupported AI provider: ${config.provider}`);
  }
}
