import { NextResponse } from 'next/server';

/**
 * API endpoint to generate a temporary JWT token for Speechmatics Real-Time API
 * This allows the client to connect directly to Speechmatics without a proxy
 * 
 * Uses @speechmatics/auth package as per official documentation:
 * https://docs.speechmatics.com/speech-to-text/realtime/quickstart
 * 
 * The JWT is valid for a short period (default: 60 seconds) and can be used
 * in the WebSocket URL: wss://eu2.rt.speechmatics.com/v2?jwt=TOKEN
 */
export async function GET() {
  console.log('[API /speechmatics-jwt] 🔐 JWT token request received');
  
  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) {
    console.error('[API /speechmatics-jwt] ❌ SPEECHMATICS_API_KEY not set');
    return NextResponse.json(
      { error: 'Speechmatics API key is not set' },
      { status: 500 }
    );
  }

  const region = process.env.SPEECHMATICS_REGION || 'eu2';
  const ttl = parseInt(process.env.SPEECHMATICS_JWT_TTL || '60', 10); // Default 60 seconds

  try {
    // Use @speechmatics/auth package to generate JWT
    // This is the official method recommended by Speechmatics
    const { createSpeechmaticsJWT } = await import('@speechmatics/auth');
    
    console.log('[API /speechmatics-jwt] Generating JWT with TTL:', ttl, 's');
    const jwt = await createSpeechmaticsJWT({
      type: 'rt', // Real-time transcription
      apiKey: apiKey,
      ttl: ttl, // Time to live in seconds
    });
    
    if (!jwt) {
      throw new Error('JWT generation returned empty token');
    }
    
    console.log('[API /speechmatics-jwt] ✅ JWT token generated successfully');
    return NextResponse.json({ jwt, ttl, region });
  } catch (error) {
    console.error('[API /speechmatics-jwt] ❌ Error generating JWT:', error);
    return NextResponse.json(
      { error: `Error generating JWT: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

