import { NextResponse } from 'next/server';

/**
 * API endpoint to get LLM API key (Anthropic or OpenAI)
 * This endpoint returns the API key from environment variables based on provider
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const provider = body.provider || 'anthropic';
    
    let apiKey: string | undefined;
    if (provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (provider === 'anthropic') {
      apiKey = process.env.ANTHROPIC_API_KEY;
    } else {
      return new NextResponse(`Unsupported provider: ${provider}`, { status: 400 });
    }
    
    if (!apiKey) {
      console.error(`[API /llm-token] ❌ ${provider.toUpperCase()}_API_KEY not set`);
      return new NextResponse(`${provider} API key is not set`, { status: 500 });
    }

    console.log(`[API /llm-token] ✅ API key found for ${provider}`);
    return NextResponse.json({ apiKey });
  } catch (error) {
    console.error('[API /llm-token] ❌ Error:', error);
    return new NextResponse('Invalid request', { status: 400 });
  }
}







