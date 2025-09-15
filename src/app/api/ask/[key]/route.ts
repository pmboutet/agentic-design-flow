import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, Ask } from '@/types';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';

/**
 * GET /api/ask/[key] - Retrieve ASK data from external backend
 * This endpoint calls the external webhook to get ASK data and conversation state
 */
export async function GET(
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

    const externalWebhook = process.env.EXTERNAL_RESPONSE_WEBHOOK;
    
    if (!externalWebhook) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'External webhook not configured'
      }, { status: 500 });
    }

    // Call external backend to get ASK data and conversation state
    const response = await fetch(externalWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'agentic-design-flow',
        'X-Request-Type': 'get-session'
      },
      body: JSON.stringify({
        askKey: key,
        action: 'get_session_data'
      })
    });

    if (!response.ok) {
      throw new Error(`External webhook responded with status ${response.status}`);
    }

    const backendData = await response.json();

    // Handle both n8n format (with data wrapper) and direct format
    const askData = backendData.data?.ask || backendData.ask;
    const messagesData = backendData.data?.messages || backendData.messages || [];
    const challengesData = backendData.data?.challenges || backendData.challenges || [];

    // Validate backend response structure
    if (!askData || !askData.question) {
      throw new Error('Invalid response from backend: missing ASK data');
    }

    // Transform backend data to our ASK format
    const ask: Ask = {
      id: key,
      key: key,
      question: askData.question,
      isActive: askData.isActive ?? true,
      endDate: askData.endDate,
      createdAt: askData.createdAt || new Date().toISOString(),
      updatedAt: askData.updatedAt || new Date().toISOString()
    };

    // Check if ASK is still active based on end date
    if (ask.endDate) {
      ask.isActive = new Date(ask.endDate).getTime() > Date.now();
    }

    return NextResponse.json<ApiResponse<{
      ask: Ask;
      messages: any[];
      challenges: any[];
    }>>({
      success: true,
      data: {
        ask,
        messages: messagesData,
        challenges: challengesData
      }
    });

  } catch (error) {
    console.error('Error retrieving ASK from backend:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * POST /api/ask/[key] - Send message to external backend
 * This endpoint forwards user messages to the external backend
 */
export async function POST(
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

    const messageData = await request.json();

    const externalWebhook = process.env.EXTERNAL_RESPONSE_WEBHOOK;
    
    if (!externalWebhook) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'External webhook not configured'
      }, { status: 500 });
    }

    // Forward message to external backend
    const response = await fetch(externalWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'agentic-design-flow',
        'X-Request-Type': 'user-message'
      },
      body: JSON.stringify({
        askKey: key,
        action: 'user_message',
        message: messageData
      })
    });

    if (!response.ok) {
      throw new Error(`External webhook responded with status ${response.status}`);
    }

    const result = await response.json();

    return NextResponse.json<ApiResponse>({
      success: true,
      data: result,
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Error sending message to backend:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
