import { NextResponse } from 'next/server';

/**
 * API endpoint to get Speechmatics API key
 * This endpoint returns the API key from environment variables
 * Note: In production, you might want to add authentication/authorization
 */
export async function GET() {
  console.log('[API /speechmatics-token] 🔐 Token request received');
  const key = process.env.SPEECHMATICS_API_KEY;
  
  if (!key) {
    console.error('[API /speechmatics-token] ❌ SPEECHMATICS_API_KEY not set');
    return new NextResponse("Speechmatics API key is not set", { status: 500 });
  }

  console.log('[API /speechmatics-token] ✅ API key found');
  return NextResponse.json({ apiKey: key });
}

