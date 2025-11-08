import { NextResponse } from 'next/server';

/**
 * API endpoint to get ElevenLabs API key
 * This endpoint returns the API key from environment variables
 * Note: In production, you might want to add authentication/authorization
 */
export async function GET() {
  console.log('[API /elevenlabs-token] 🔐 Token request received');
  const key = process.env.ELEVENLABS_API_KEY;
  
  if (!key) {
    console.error('[API /elevenlabs-token] ❌ ELEVENLABS_API_KEY not set');
    return new NextResponse("ElevenLabs API key is not set", { status: 500 });
  }

  console.log('[API /elevenlabs-token] ✅ API key found');
  return NextResponse.json({ apiKey: key });
}

