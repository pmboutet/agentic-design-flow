import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple test endpoint to check if the app is working
 * This bypasses the webhook system for testing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  const askSessionId = `ask-session-${key}`;
  const nowIso = new Date().toISOString();
  const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Return mock data for testing
  const mockData = {
    success: true,
    data: {
      ask: {
        id: `ask-${key}`,
        key,
        name: 'Session de test',
        question: "Test question: What challenges do you face in your daily work?",
        description: "Cette session de démonstration vous aide à tester l'interface publique de l'ASK.",
        status: 'active',
        isActive: true,
        startDate: nowIso,
        endDate: tomorrowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        deliveryMode: 'digital',
        audienceScope: 'group',
        responseMode: 'simultaneous',
        participants: [
          {
            id: 'participant-1',
            name: 'Alice Martin',
            email: 'alice@example.com',
            role: 'facilitator',
            isSpokesperson: true,
            isActive: true,
          },
          {
            id: 'participant-2',
            name: 'Bob Leroy',
            email: 'bob@example.com',
            role: 'participant',
            isSpokesperson: false,
            isActive: true,
          },
        ],
        askSessionId,
      },
      messages: [
        {
          id: "msg-1",
          askKey: key,
          askSessionId,
          content: "Hello! I'm here to understand your challenges. Could you tell me about your current situation?",
          type: "text",
          senderType: 'ai',
          senderName: 'Agent',
          timestamp: nowIso,
          metadata: { senderName: 'Agent' }
        }
      ],
      challenges: [],
      insights: [
        {
          id: 'insight-1',
          askId: `ask-${key}`,
          askSessionId,
          content: "Les retards proviennent principalement des validations multiples.",
          summary: "Identifier les validations comme point de friction.",
          type: 'pain',
          category: 'organisation',
          status: 'new',
          priority: 'medium',
          createdAt: nowIso,
          updatedAt: nowIso,
          relatedChallengeIds: [],
          kpis: [],
          authorId: null,
          authorName: 'Agent',
          authors: [
            {
              id: 'insight-author-1',
              userId: null,
              name: 'Agent',
            }
          ],
          sourceMessageId: 'msg-1',
        },
      ],
    }
  };

  return NextResponse.json(mockData);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const body = await request.json();

  console.log(`[TEST] Received message for key: ${key}`, body);

  const askSessionId = `ask-session-${key}`;
  const timestamp = body.timestamp ?? new Date().toISOString();
  const senderName = body.senderName ?? 'Vous';

  const message = {
    id: `msg-${Date.now()}`,
    askKey: key,
    askSessionId,
    content: body.content,
    type: body.type ?? 'text',
    senderType: body.senderType ?? 'user',
    senderId: null,
    senderName,
    timestamp,
    metadata: {
      ...(body.metadata ?? {}),
      senderName,
    },
  };

  return NextResponse.json({
    success: true,
    data: { message },
    message: 'Message saved successfully (test mode)'
  });
}
