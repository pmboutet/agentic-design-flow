import { NextResponse } from 'next/server';
import { DeepgramClient } from '@deepgram/sdk';

export async function GET() {
  console.log('[API /token] 🔐 Token request received');
  const key = process.env.DEEPGRAM_API_KEY;
  
  if (!key) {
    console.error('[API /token] ❌ DEEPGRAM_API_KEY not set');
    return new NextResponse("Deepgram API key is not set", { status: 500 });
  }

  console.log('[API /token] API key found, length:', key.length);

  try {
    console.log('[API /token] Creating DeepgramClient...');
    const client = new DeepgramClient({ key });
    console.log('[API /token] Requesting token from Deepgram...');
    const tokenResponse = await client.auth.grantToken({ ttl_seconds: 3600 });

    if (tokenResponse.error) {
      console.error('[API /token] ❌ Token generation error:', tokenResponse.error);
      return new NextResponse(
        `Error generating token: ${tokenResponse.error.message}`, 
        { status: 500 }
      );
    }

    const token = tokenResponse.result.access_token;
    console.log('[API /token] ✅ Token generated successfully, length:', token?.length || 0);
    return NextResponse.json({ token });
  } catch (error) {
    console.error('[API /token] ❌ Exception generating token:', error);
    return new NextResponse(
      `Error generating token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 }
    );
  }
}

