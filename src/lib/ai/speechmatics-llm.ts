/**
 * LLM integration for Speechmatics Voice Agent
 */

export class SpeechmaticsLLM {
  async getLLMApiKey(provider: "anthropic" | "openai"): Promise<string> {
    const response = await fetch('/api/llm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get LLM API key: ${errorText}`);
    }

    const data = await response.json();
    return data.apiKey;
  }

  async callLLM(
    provider: "anthropic" | "openai",
    apiKey: string,
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      enableThinking?: boolean;
      thinkingBudgetTokens?: number;
    }
  ): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system');
    
    const payload: Record<string, unknown> = {
      provider,
      model,
      messages,
      systemPrompt: systemMessage?.content || '',
    };

    if (options?.enableThinking) {
      payload.enableThinking = true;
      if (typeof options.thinkingBudgetTokens === "number") {
        payload.thinkingBudgetTokens = options.thinkingBudgetTokens;
      }
    }

    const response = await fetch('/api/speechmatics-llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`LLM API error: ${(error as any).error || response.statusText}`);
    }

    const data = await response.json();
    return data.content || '';
  }
}




