import { NextResponse } from 'next/server';

/**
 * API endpoint to call LLM (Anthropic or OpenAI) for Speechmatics voice agent
 * This avoids CORS issues by making the API call server-side
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, model, messages, systemPrompt, enableThinking, thinkingBudgetTokens } = body;

    if (!provider || !model || !messages) {
      return NextResponse.json(
        { error: 'Missing required fields: provider, model, messages' },
        { status: 400 }
      );
    }

    let apiKey: string | undefined;
    if (provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (provider === 'anthropic') {
      apiKey = process.env.ANTHROPIC_API_KEY;
    } else {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 }
      );
    }

    if (!apiKey) {
      console.error(`[API /speechmatics-llm] ❌ ${provider.toUpperCase()}_API_KEY not set`);
      return NextResponse.json(
        { error: `${provider} API key is not set` },
        { status: 500 }
      );
    }

    // Filter out system messages and prepare conversation
    const conversationMessages = messages.filter((m: any) => m.role !== 'system');

    if (provider === 'anthropic') {
      const anthropicBody: Record<string, unknown> = {
        model,
        max_tokens: 1024,
        system: systemPrompt || '',
        messages: conversationMessages,
      };

      // Add thinking mode if enabled
      if (enableThinking) {
        const budgetTokens = thinkingBudgetTokens ?? 10000;
        anthropicBody.thinking = {
          type: "enabled",
          budget_tokens: Math.max(1024, budgetTokens), // Ensure minimum 1024 tokens
        };
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[API /speechmatics-llm] ❌ Anthropic API error:', error);
        return NextResponse.json(
          { error: `Anthropic API error: ${(error as any).error?.message || response.statusText}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      const content = data.content[0]?.text || '';
      return NextResponse.json({ content });
    } else {
      // OpenAI
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages, // OpenAI includes system messages in the array
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[API /speechmatics-llm] ❌ OpenAI API error:', error);
        return NextResponse.json(
          { error: `OpenAI API error: ${(error as any).error?.message || response.statusText}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      return NextResponse.json({ content });
    }
  } catch (error) {
    console.error('[API /speechmatics-llm] ❌ Error:', error);
    return NextResponse.json(
      { error: `Internal error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

