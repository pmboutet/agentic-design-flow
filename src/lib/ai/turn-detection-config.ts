export type SemanticTurnFallbackMode = "force-send" | "vad-only";

export interface SemanticTurnDetectorConfig {
  enabled: boolean;
  provider: "openai" | "http" | "disabled";
  model: string;
  baseUrl: string;
  apiKey?: string;
  requestTimeoutMs: number;
  topLogprobs: number;
  trackedTokens: string[];
  probabilityThreshold: number;
  gracePeriodMs: number;
  maxHoldMs: number;
  fallbackMode: SemanticTurnFallbackMode;
  contextMessages: number;
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function resolveApiKey(): string | undefined {
  // Try client-side variables first (NEXT_PUBLIC_ prefix)
  const explicitKey = process.env.NEXT_PUBLIC_SEMANTIC_TURN_DETECTOR_API_KEY || process.env.SEMANTIC_TURN_DETECTOR_API_KEY;
  if (explicitKey) {
    return explicitKey;
  }
  const envVar = process.env.NEXT_PUBLIC_SEMANTIC_TURN_DETECTOR_API_KEY_ENV || process.env.SEMANTIC_TURN_DETECTOR_API_KEY_ENV;
  if (envVar && process.env[envVar]) {
    return process.env[envVar];
  }
  return undefined;
}

export function resolveSemanticTurnDetectorConfig(): SemanticTurnDetectorConfig {
  // IMPORTANT: Access env vars directly (not via bracket notation) for Webpack/Turbopack static analysis
  // Dynamic access like process.env[variable] doesn't work with NEXT_PUBLIC_ vars
  const provider = (
    process.env.NEXT_PUBLIC_SEMANTIC_TURN_DETECTOR_PROVIDER ||
    process.env.SEMANTIC_TURN_DETECTOR_PROVIDER ||
    "disabled"
  ).toLowerCase() as "openai" | "http" | "disabled";

  const enabled = provider !== "disabled";

  const baseUrl =
    process.env.NEXT_PUBLIC_SEMANTIC_TURN_DETECTOR_BASE_URL ||
    process.env.SEMANTIC_TURN_DETECTOR_BASE_URL ||
    (provider === "openai" ? "https://api.openai.com" : "http://127.0.0.1:11434");

  const trackedTokensEnv =
    process.env.NEXT_PUBLIC_SEMANTIC_TURN_EOT_TOKENS ||
    process.env.SEMANTIC_TURN_EOT_TOKENS;
  const trackedTokens = trackedTokensEnv?.split(",").map(token => token.trim()).filter(Boolean) || [
    "<|im_end|>",
    "</s>",
    "<|eot_id|>",
    ".",
    " .",
    "!",
    " !",
    "?",
    " ?",
    "\n",
    "\n\n",
  ];

  const fallbackEnv = (
    process.env.NEXT_PUBLIC_SEMANTIC_TURN_FALLBACK ||
    process.env.SEMANTIC_TURN_FALLBACK ||
    "force-send"
  ).toLowerCase();
  const fallbackMode: SemanticTurnFallbackMode =
    fallbackEnv === "vad-only" ? "vad-only" : "force-send";

  return {
    enabled,
    provider,
    model: process.env.NEXT_PUBLIC_SEMANTIC_TURN_DETECTOR_MODEL || process.env.SEMANTIC_TURN_DETECTOR_MODEL || "gpt-4o-mini",
    baseUrl,
    apiKey: resolveApiKey(),
    requestTimeoutMs: parseNumber(
      process.env.NEXT_PUBLIC_SEMANTIC_TURN_REQUEST_TIMEOUT_MS || process.env.SEMANTIC_TURN_REQUEST_TIMEOUT_MS,
      1200
    ),
    topLogprobs: parseNumber(
      process.env.NEXT_PUBLIC_SEMANTIC_TURN_LOGPROBS || process.env.SEMANTIC_TURN_LOGPROBS,
      8
    ),
    trackedTokens,
    probabilityThreshold: Math.min(
      0.99,
      Math.max(0.01, parseNumber(
        process.env.NEXT_PUBLIC_SEMANTIC_TURN_PROB_THRESHOLD || process.env.SEMANTIC_TURN_PROB_THRESHOLD,
        0.72
      ))
    ),
    gracePeriodMs: parseNumber(
      process.env.NEXT_PUBLIC_SEMANTIC_TURN_GRACE_MS || process.env.SEMANTIC_TURN_GRACE_MS,
      900
    ),
    maxHoldMs: parseNumber(
      process.env.NEXT_PUBLIC_SEMANTIC_TURN_MAX_HOLD_MS || process.env.SEMANTIC_TURN_MAX_HOLD_MS,
      5000
    ),
    fallbackMode,
    contextMessages: Math.max(2, parseNumber(
      process.env.NEXT_PUBLIC_SEMANTIC_TURN_CONTEXT_MESSAGES || process.env.SEMANTIC_TURN_CONTEXT_MESSAGES,
      6
    )),
  };
}
