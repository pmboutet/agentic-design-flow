import { NextRequest, NextResponse } from 'next/server';
import { WebhookAskPayload, ApiResponse, Ask } from '@/types';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';

// In-memory storage for demo - replace with database in production
const askStorage = new Map<string, Ask>();

/**
 * GET /api/ask/[key] - Retrieve ASK data by key
 * This endpoint is called when a user clicks on an ASK link
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

    const ask = askStorage.get(key);
    
    if (!ask) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK not found'
      }, { status: 404 });
    }

    // Check if ASK is still active
    const isActive = new Date(ask.endDate).getTime() > Date.now();
    
    const responseData: Ask = {
      ...ask,
      isActive
    };

    return NextResponse.json<ApiResponse<Ask>>({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Error retrieving ASK:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * POST /api/ask/[key] - Create or update ASK data
 * This endpoint receives ASK data from external systems
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

    const body: WebhookAskPayload = await request.json();

    if (!body.question || !body.endDate) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Missing required fields: question, endDate'
      }, { status: 400 });
    }

    // Validate end date
    const endDate = new Date(body.endDate);
    if (isNaN(endDate.getTime())) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid end date format'
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const isActive = endDate.getTime() > Date.now();

    const ask: Ask = {
      id: key,
      key: key,
      question: body.question,
      isActive,
      endDate: body.endDate,
      createdAt: askStorage.get(key)?.createdAt || now,
      updatedAt: now
    };

    askStorage.set(key, ask);

    return NextResponse.json<ApiResponse<Ask>>({
      success: true,
      data: ask,
      message: 'ASK created/updated successfully'
    });

  } catch (error) {
    console.error('Error creating/updating ASK:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * DELETE /api/ask/[key] - Close/deactivate an ASK
 * This endpoint is called to close an ASK session
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

    const ask = askStorage.get(key);
    
    if (!ask) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK not found'
      }, { status: 404 });
    }

    // Mark ASK as inactive
    const updatedAsk: Ask = {
      ...ask,
      isActive: false,
      updatedAt: new Date().toISOString()
    };

    askStorage.set(key, updatedAsk);

    return NextResponse.json<ApiResponse<Ask>>({
      success: true,
      data: updatedAsk,
      message: 'ASK closed successfully'
    });

  } catch (error) {
    console.error('Error closing ASK:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
