import { NextResponse } from 'next/server';
import { DeepgramClient } from '@deepgram/sdk';

export async function GET() {
  const key = process.env.DEEPGRAM_API_KEY;
  
  if (!key) {
    return new NextResponse("Deepgram API key is not set", { status: 500 });
  }

  try {
    const client = new DeepgramClient({ key });
    const tokenResponse = await client.auth.grantToken({ ttl_seconds: 3600 });

    if (tokenResponse.error) {
      return new NextResponse(
        `Error generating token: ${tokenResponse.error.message}`, 
        { status: 500 }
      );
    }

    return NextResponse.json({ token: tokenResponse.result.access_token });
  } catch (error) {
    console.error('Error generating Deepgram token:', error);
    return new NextResponse(
      `Error generating token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 }
    );
  }
}

