import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, Challenge } from '@/types';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';

/**
 * PUT /api/challenges/[key] - Update a single challenge via external backend
 * This endpoint forwards challenge updates to the external backend
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const { key } = params;

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    const updateData = await request.json();

    const externalWebhook = process.env.EXTERNAL_RESPONSE_WEBHOOK;
    
    if (!externalWebhook) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'External webhook not configured'
      }, { status: 500 });
    }

    // Forward challenge update to external backend
    const response = await fetch(externalWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'agentic-design-flow',
        'X-Request-Type': 'challenge-update'
      },
      body: JSON.stringify({
        askKey: key,
        action: 'update_challenge',
        ...updateData
      })
    });

    if (!response.ok) {
      throw new Error(`External webhook responded with status ${response.status}`);
    }

    const result = await response.json();

    return NextResponse.json<ApiResponse>({
      success: true,
      data: result,
      message: 'Challenge updated successfully'
    });

  } catch (error) {
    console.error('Error updating challenge via backend:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
