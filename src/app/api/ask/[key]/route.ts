import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, Ask, AskParticipant, Insight } from '@/types';
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
    const insightsData = backendData.data?.insights || backendData.insights || [];
    const participantData = askData?.participants || backendData.data?.participants || backendData.participants || [];

    // Validate backend response structure
    if (!askData || !askData.question) {
      throw new Error('Invalid response from backend: missing ASK data');
    }

    // Transform backend data to our ASK format
    const participants: AskParticipant[] = Array.isArray(participantData)
      ? participantData.map((participant: any, index: number) => ({
          id: String(participant.id ?? `participant-${index}`),
          name: participant.name || participant.fullName || participant.email || `Participant ${index + 1}`,
          email: participant.email ?? null,
          role: participant.role ?? participant.title ?? null,
          isSpokesperson: participant.isSpokesperson ?? participant.spokesperson ?? false,
          isActive: participant.isActive ?? true,
        }))
      : [];

    const ask: Ask = {
      id: key,
      key: key,
      question: askData.question,
      isActive: askData.isActive ?? true,
      endDate: askData.endDate,
      createdAt: askData.createdAt || new Date().toISOString(),
      updatedAt: askData.updatedAt || new Date().toISOString(),
      deliveryMode: askData.deliveryMode || askData.mode || 'digital',
      audienceScope: askData.audienceScope || (participants.length > 1 ? 'group' : 'individual'),
      responseMode: askData.responseMode || (participants.length > 1 ? 'simultaneous' : 'collective'),
      participants,
      askSessionId: askData.askSessionId || askData.sessionId || undefined,
    };

    // Check if ASK is still active based on end date
    if (ask.endDate) {
      ask.isActive = new Date(ask.endDate).getTime() > Date.now();
    }

    const insights: Insight[] = Array.isArray(insightsData)
      ? insightsData.map((insight: any, index: number) => ({
          id: insight.id ?? `insight-${index}`,
          askId: insight.askId ?? askData.id ?? key,
          askSessionId: insight.askSessionId ?? askData.askSessionId ?? askData.id ?? key,
          challengeId: insight.challengeId ?? insight.linkedChallengeId ?? null,
          authorId: insight.authorId ?? insight.userId ?? null,
          authorName: insight.authorName ?? insight.author ?? insight.userName ?? null,
          content: insight.content ?? insight.message ?? '',
          summary: insight.summary ?? insight.synopsis ?? null,
          type: insight.type ?? insight.insightType ?? 'idea',
          category: insight.category ?? null,
          status: insight.status ?? 'new',
          priority: insight.priority ?? null,
          createdAt: insight.createdAt ?? new Date().toISOString(),
          updatedAt: insight.updatedAt ?? insight.createdAt ?? new Date().toISOString(),
          relatedChallengeIds: insight.relatedChallengeIds ?? insight.challengeIds ?? [],
          kpis: Array.isArray(insight.kpis)
            ? insight.kpis.map((kpi: any, kIndex: number) => ({
                id: kpi.id ?? `kpi-${kIndex}`,
                label: kpi.label ?? kpi.name ?? 'KPI',
                value: kpi.value ?? kpi.metric ?? undefined,
                description: kpi.description ?? null,
              }))
            : [],
          sourceMessageId: insight.sourceMessageId ?? insight.messageId ?? null,
        }))
      : [];

    return NextResponse.json<ApiResponse<{
      ask: Ask;
      messages: any[];
      challenges: any[];
      insights: Insight[];
    }>>({
      success: true,
      data: {
        ask,
        messages: messagesData,
        challenges: challengesData,
        insights,
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
