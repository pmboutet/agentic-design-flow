import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple test endpoint to check if the app is working
 * This bypasses the webhook system for testing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const { key } = params;

  // Return mock data for testing
  const mockData = {
    success: true,
    data: {
      ask: {
        id: `ask-${key}`,
        question: "Test question: What challenges do you face in your daily work?",
        isActive: true,
        endDate: "2024-12-31T23:59:59Z"
      },
      messages: [
        {
          id: "msg-1",
          content: "Hello! I'm here to understand your challenges. Could you tell me about your current situation?",
          type: "text",
          sender: "ai",
          timestamp: new Date().toISOString()
        }
      ],
      challenges: []
    }
  };

  return NextResponse.json(mockData);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const { key } = params;
  const body = await request.json();

  console.log(`[TEST] Received message for key: ${key}`, body);

  // Mock response - in real app this would call your n8n webhook
  const mockResponse = {
    success: true,
    data: {
      ask: {
        id: `ask-${key}`,
        question: "Test question: What challenges do you face in your daily work?",
        isActive: true,
        endDate: "2024-12-31T23:59:59Z"
      },
      messages: [
        {
          id: "msg-1",
          content: "Hello! I'm here to understand your challenges. Could you tell me about your current situation?",
          type: "text",
          sender: "ai",
          timestamp: new Date(Date.now() - 60000).toISOString()
        },
        {
          id: "msg-2",
          content: body.content,
          type: body.type,
          sender: "user",
          timestamp: body.timestamp
        },
        {
          id: "msg-3",
          content: "Thank you for sharing that. This helps me understand your situation better. Could you tell me more about the specific impact this has on your work?",
          type: "text",
          sender: "ai",
          timestamp: new Date().toISOString()
        }
      ],
      challenges: [
        {
          id: "challenge-1",
          name: "Communication Efficiency",
          pains: [
            {
              id: "pain-1",
              name: "Response Delays",
              description: "Based on what you shared, there seem to be delays in communication",
              kpiEstimations: [
                {
                  description: "Average response time",
                  value: { current: 4, target: 2, unit: "hours" }
                }
              ]
            }
          ],
          gains: [
            {
              id: "gain-1",
              name: "Improved Productivity",
              description: "Faster communication would improve overall productivity",
              kpiEstimations: [
                {
                  description: "Productivity increase",
                  value: { expected: 25, unit: "percent", timeframe: "monthly" }
                }
              ]
            }
          ]
        }
      ]
    }
  };

  return NextResponse.json(mockResponse);
}
