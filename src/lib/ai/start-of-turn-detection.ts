/**
 * Start-of-Turn Detection
 *
 * Uses LLM to validate if detected speech is:
 * 1. A genuine start of user speech (not noise/background)
 * 2. Not an echo of what the assistant is currently saying
 *
 * Similar to end-of-turn detection but validates the START of user interruption
 */

export interface StartOfTurnMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StartOfTurnDetectorConfig {
  enabled: boolean;
  provider: "openai" | "anthropic";
  model: string;
  apiKey?: string;
  requestTimeoutMs: number;
}

export interface StartOfTurnValidationResult {
  isValidStart: boolean;
  isEcho: boolean;
  confidence: number;
  reason?: string;
}

export interface StartOfTurnDetector {
  validateStartOfTurn(
    userTranscript: string,
    currentAssistantSpeech: string,
    conversationHistory: StartOfTurnMessage[]
  ): Promise<StartOfTurnValidationResult>;
}

class LLMStartOfTurnDetector implements StartOfTurnDetector {
  constructor(private readonly config: StartOfTurnDetectorConfig) {}

  async validateStartOfTurn(
    userTranscript: string,
    currentAssistantSpeech: string,
    conversationHistory: StartOfTurnMessage[]
  ): Promise<StartOfTurnValidationResult> {
    if (!this.config.enabled) {
      return {
        isValidStart: true,
        isEcho: false,
        confidence: 0.5,
        reason: "Detector disabled",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
      console.log(`[${timestamp}] [StartOfTurn] 📤 Validating start of turn`, {
        userTranscript: userTranscript.substring(0, 50),
        assistantSpeech: currentAssistantSpeech.substring(0, 50),
        provider: this.config.provider,
      });

      const result = this.config.provider === "anthropic"
        ? await this.validateWithAnthropic(userTranscript, currentAssistantSpeech, conversationHistory, controller.signal)
        : await this.validateWithOpenAI(userTranscript, currentAssistantSpeech, conversationHistory, controller.signal);

      const ts = new Date().toISOString().split('T')[1].replace('Z', '');
      console.log(`[${ts}] [StartOfTurn] 📥 Validation result`, {
        isValidStart: result.isValidStart,
        isEcho: result.isEcho,
        confidence: result.confidence,
        reason: result.reason,
      });

      return result;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        console.warn("[StartOfTurn] Validation timeout - assuming valid start");
        return {
          isValidStart: true,
          isEcho: false,
          confidence: 0.5,
          reason: "Timeout - assuming valid",
        };
      }
      console.error("[StartOfTurn] Validation error - assuming valid start", error);
      return {
        isValidStart: true,
        isEcho: false,
        confidence: 0.5,
        reason: "Error - assuming valid",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async validateWithAnthropic(
    userTranscript: string,
    currentAssistantSpeech: string,
    conversationHistory: StartOfTurnMessage[],
    signal: AbortSignal
  ): Promise<StartOfTurnValidationResult> {
    const systemPrompt = `You are a voice conversation analyzer. Your task is to determine if a detected speech transcript is:
1. A genuine start of user speech (valid interruption)
2. An echo/repetition of what the assistant is currently saying

Respond with a JSON object:
{
  "isValidStart": true/false,
  "isEcho": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

Rules:
- If the transcript closely matches what the assistant is saying, it's an echo (isEcho=true, isValidStart=false)
- If the transcript is semantically similar to recent assistant speech, it's likely an echo
- If the transcript is a new statement/question from the user, it's valid (isValidStart=true, isEcho=false)
- If the transcript is too short (< 3 words), be cautious (lower confidence)
- Consider the conversation context to determine if this is a natural user turn`;

    const recentHistory = conversationHistory.slice(-2).map(msg =>
      `${msg.role === 'assistant' ? 'Assistant' : 'User'}: ${msg.content}`
    ).join('\n');

    const userPrompt = `Current situation:
- Assistant is currently saying: "${currentAssistantSpeech}"
- Detected user speech: "${userTranscript}"
- Recent conversation:
${recentHistory}

Is this detected speech a valid start of user turn, or is it an echo of the assistant?`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 256,
        temperature: 0,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt }
        ],
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    return JSON.parse(jsonMatch[0]);
  }

  private async validateWithOpenAI(
    userTranscript: string,
    currentAssistantSpeech: string,
    conversationHistory: StartOfTurnMessage[],
    signal: AbortSignal
  ): Promise<StartOfTurnValidationResult> {
    const systemPrompt = `You are a voice conversation analyzer. Determine if detected speech is a genuine user interruption or an echo of the assistant. Respond with JSON only:
{
  "isValidStart": true/false,
  "isEcho": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`;

    const recentHistory = conversationHistory.slice(-2).map(msg =>
      `${msg.role === 'assistant' ? 'Assistant' : 'User'}: ${msg.content}`
    ).join('\n');

    const userPrompt = `Assistant currently saying: "${currentAssistantSpeech}"
Detected user speech: "${userTranscript}"
Recent conversation:
${recentHistory}

Is this a valid user interruption or an echo?`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0,
        max_tokens: 256,
        response_format: { type: "json_object" },
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    return JSON.parse(content);
  }
}

export function createStartOfTurnDetector(
  config: StartOfTurnDetectorConfig
): StartOfTurnDetector | null {
  if (!config.enabled) {
    return null;
  }
  return new LLMStartOfTurnDetector(config);
}

/**
 * Resolve configuration from environment variables
 */
export function resolveStartOfTurnDetectorConfig(): StartOfTurnDetectorConfig {
  const provider = (
    process.env.NEXT_PUBLIC_START_OF_TURN_PROVIDER ||
    process.env.START_OF_TURN_PROVIDER ||
    "openai"
  ).toLowerCase() as "openai" | "anthropic";

  const enabled = (
    process.env.NEXT_PUBLIC_START_OF_TURN_ENABLED ||
    process.env.START_OF_TURN_ENABLED ||
    "true"
  ).toLowerCase() === "true";

  const model =
    process.env.NEXT_PUBLIC_START_OF_TURN_MODEL ||
    process.env.START_OF_TURN_MODEL ||
    (provider === "anthropic" ? "claude-3-5-haiku-latest" : "gpt-4o-mini");

  const apiKey =
    process.env.NEXT_PUBLIC_START_OF_TURN_API_KEY ||
    process.env.START_OF_TURN_API_KEY ||
    (provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY);

  const requestTimeoutMs = parseInt(
    process.env.NEXT_PUBLIC_START_OF_TURN_TIMEOUT_MS ||
    process.env.START_OF_TURN_TIMEOUT_MS ||
    "800",
    10
  );

  return {
    enabled,
    provider,
    model,
    apiKey,
    requestTimeoutMs,
  };
}
