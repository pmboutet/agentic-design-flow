import { NextRequest, NextResponse } from 'next/server';
import { WebhookResponsePayload, ApiResponse, Message } from '@/types';
import { isValidAskKey, parseErrorMessage, generateId } from '@/lib/utils';

// In-memory storage for demo - replace with database in production
const messageStorage = new Map<string, Message[]>();

/**
 * GET /api/messages/[key] - Retrieve messages for an ASK session
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

    const messages = messageStorage.get(key) || [];

    return NextResponse.json<ApiResponse<Message[]>>({
      success: true,
      data: messages
    });

  } catch (error) {
    console.error('Error retrieving messages:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * POST /api/messages/[key] - Send a message to an ASK session
 * This endpoint handles both user messages and AI responses
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

    const body: WebhookResponsePayload = await request.json();

    if (!body.content) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Message content is required'
      }, { status: 400 });
    }

    // Validate message type
    const validTypes = ['text', 'audio', 'image', 'document'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid message type'
      }, { status: 400 });
    }

    const message: Message = {
      id: generateId(),
      askKey: key,
      content: body.content,
      type: body.type,
      sender: 'user', // Default to user, can be overridden
      timestamp: new Date().toISOString(),
      metadata: body.metadata
    };

    // Get existing messages or create new array
    const existingMessages = messageStorage.get(key) || [];
    const updatedMessages = [...existingMessages, message];
    
    // Store updated messages
    messageStorage.set(key, updatedMessages);

    // Forward message to external webhook if configured
    const externalWebhook = process.env.EXTERNAL_RESPONSE_WEBHOOK;
    if (externalWebhook) {
      try {
        await fetch(externalWebhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Source': 'agentic-design-flow'
          },
          body: JSON.stringify({
            askKey: key,
            message: message,
            allMessages: updatedMessages
          })
        });
      } catch (webhookError) {
        console.error('Error forwarding to external webhook:', webhookError);
        // Don't fail the request if webhook fails
      }
    }

    return NextResponse.json<ApiResponse<Message>>({
      success: true,
      data: message,
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * PUT /api/messages/[key] - Add AI response to conversation
 * This endpoint is called by external systems to add AI responses
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

    const body: WebhookResponsePayload = await request.json();

    if (!body.content) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Message content is required'
      }, { status: 400 });
    }

    const aiMessage: Message = {
      id: generateId(),
      askKey: key,
      content: body.content,
      type: body.type || 'text',
      sender: 'ai',
      timestamp: new Date().toISOString(),
      metadata: body.metadata
    };

    // Get existing messages or create new array
    const existingMessages = messageStorage.get(key) || [];
    const updatedMessages = [...existingMessages, aiMessage];
    
    // Store updated messages
    messageStorage.set(key, updatedMessages);

    return NextResponse.json<ApiResponse<Message>>({
      success: true,
      data: aiMessage,
      message: 'AI response added successfully'
    });

  } catch (error) {
    console.error('Error adding AI response:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * DELETE /api/messages/[key] - Clear messages for an ASK session
 * This endpoint can be used to reset conversation history
 */
export async function DELETE(
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

    // Clear messages for this ASK
    messageStorage.delete(key);

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Messages cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing messages:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
