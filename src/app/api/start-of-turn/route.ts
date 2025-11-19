import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint for start-of-turn detection (AI-powered barge-in validation)
 * This endpoint acts as a secure proxy to avoid exposing API keys to the client
 *
 * Validates whether detected speech is:
 * 1. A genuine start of user speech (not noise/background)
 * 2. Not an echo of what the assistant is currently saying
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userTranscript,
      currentAssistantSpeech,
      conversationHistory,
      provider = 'anthropic',
      model
    } = body;

    if (!userTranscript) {
      return NextResponse.json(
        { error: 'Missing required parameter: userTranscript' },
        { status: 400 }
      );
    }

    // Route to appropriate provider
    if (provider === 'anthropic') {
      return await validateWithAnthropic(
        userTranscript,
        currentAssistantSpeech || '',
        conversationHistory || [],
        model || 'claude-3-5-haiku-latest'
      );
    } else if (provider === 'openai') {
      return await validateWithOpenAI(
        userTranscript,
        currentAssistantSpeech || '',
        conversationHistory || [],
        model || 'gpt-4o-mini'
      );
    } else {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[StartOfTurn] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function validateWithAnthropic(
  userTranscript: string,
  currentAssistantSpeech: string,
  conversationHistory: Array<{ role: string; content: string }>,
  model: string
): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[StartOfTurn] ANTHROPIC_API_KEY not configured');
    return NextResponse.json(
      { error: 'Anthropic API key not configured' },
      { status: 500 }
    );
  }

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

  console.log('[StartOfTurn] 📤 Calling Anthropic API', {
    model,
    userTranscriptLength: userTranscript.length,
    assistantSpeechLength: currentAssistantSpeech.length,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      temperature: 0,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[StartOfTurn] Anthropic API error', {
      status: response.status,
      errorData,
    });
    return NextResponse.json(
      { error: 'Anthropic API error', details: errorData },
      { status: response.status }
    );
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[StartOfTurn] No JSON found in Anthropic response:', content);
    return NextResponse.json(
      { error: 'Invalid response format from AI' },
      { status: 500 }
    );
  }

  const result = JSON.parse(jsonMatch[0]);
  console.log('[StartOfTurn] 📥 Anthropic validation result:', result);

  return NextResponse.json(result);
}

async function validateWithOpenAI(
  userTranscript: string,
  currentAssistantSpeech: string,
  conversationHistory: Array<{ role: string; content: string }>,
  model: string
): Promise<NextResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[StartOfTurn] OPENAI_API_KEY not configured');
    return NextResponse.json(
      { error: 'OpenAI API key not configured' },
      { status: 500 }
    );
  }

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

  console.log('[StartOfTurn] 📤 Calling OpenAI API', {
    model,
    userTranscriptLength: userTranscript.length,
    assistantSpeechLength: currentAssistantSpeech.length,
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      max_tokens: 256,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[StartOfTurn] OpenAI API error', {
      status: response.status,
      errorData,
    });
    return NextResponse.json(
      { error: 'OpenAI API error', details: errorData },
      { status: response.status }
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  const result = JSON.parse(content);
  console.log('[StartOfTurn] 📥 OpenAI validation result:', result);

  return NextResponse.json(result);
}
