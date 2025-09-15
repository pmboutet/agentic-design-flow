import { NextRequest, NextResponse } from 'next/server';
import { WebhookChallengePayload, ApiResponse, Challenge } from '@/types';
import { isValidAskKey, parseErrorMessage, deepClone } from '@/lib/utils';

// In-memory storage for demo - replace with database in production
const challengeStorage = new Map<string, Challenge[]>();

/**
 * GET /api/challenges/[key] - Retrieve challenges for an ASK session
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

    const challenges = challengeStorage.get(key) || [];

    return NextResponse.json<ApiResponse<Challenge[]>>({
      success: true,
      data: challenges
    });

  } catch (error) {
    console.error('Error retrieving challenges:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * POST /api/challenges/[key] - Update challenges for an ASK session
 * This endpoint receives challenge updates from external systems (n8n, AgentForce, etc.)
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

    const body: WebhookChallengePayload = await request.json();

    if (!body.challenges || !Array.isArray(body.challenges)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Challenges array is required'
      }, { status: 400 });
    }

    // Validate action type
    const validActions = ['update', 'replace'];
    if (!validActions.includes(body.action)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid action. Must be "update" or "replace"'
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    let updatedChallenges: Challenge[];

    if (body.action === 'replace') {
      // Replace all challenges
      updatedChallenges = body.challenges.map(challenge => ({
        ...challenge,
        updatedAt: now,
        isHighlighted: true // Mark for visual feedback
      }));
    } else {
      // Update existing challenges
      const existingChallenges = challengeStorage.get(key) || [];
      updatedChallenges = deepClone(existingChallenges);

      // Process each incoming challenge
      body.challenges.forEach(incomingChallenge => {
        const existingIndex = updatedChallenges.findIndex(
          existing => existing.id === incomingChallenge.id
        );

        if (existingIndex >= 0) {
          // Update existing challenge
          updatedChallenges[existingIndex] = {
            ...incomingChallenge,
            updatedAt: now,
            isHighlighted: true
          };
        } else {
          // Add new challenge
          updatedChallenges.push({
            ...incomingChallenge,
            updatedAt: now,
            isHighlighted: true
          });
        }
      });
    }

    // Validate challenge structure
    for (const challenge of updatedChallenges) {
      if (!challenge.id || !challenge.name) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Each challenge must have id and name'
        }, { status: 400 });
      }

      // Validate pains and gains structure
      if (challenge.pains && !Array.isArray(challenge.pains)) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Pains must be an array'
        }, { status: 400 });
      }

      if (challenge.gains && !Array.isArray(challenge.gains)) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Gains must be an array'
        }, { status: 400 });
      }

      // Validate KPI estimations
      [...(challenge.pains || []), ...(challenge.gains || [])].forEach(item => {
        if (item.kpiEstimations && !Array.isArray(item.kpiEstimations)) {
          throw new Error('KPI estimations must be an array');
        }
      });
    }

    // Store updated challenges
    challengeStorage.set(key, updatedChallenges);

    // Forward to external webhook if configured
    const externalWebhook = process.env.EXTERNAL_CHALLENGE_WEBHOOK;
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
            challenges: updatedChallenges,
            action: body.action,
            timestamp: now
          })
        });
      } catch (webhookError) {
        console.error('Error forwarding to external webhook:', webhookError);
        // Don't fail the request if webhook fails
      }
    }

    return NextResponse.json<ApiResponse<Challenge[]>>({
      success: true,
      data: updatedChallenges,
      message: `Challenges ${body.action}d successfully`
    });

  } catch (error) {
    console.error('Error updating challenges:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * PUT /api/challenges/[key] - Update a single challenge
 * This endpoint is used when user modifies challenges in the UI
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

    const challenge: Challenge = await request.json();

    if (!challenge.id || !challenge.name) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Challenge must have id and name'
      }, { status: 400 });
    }

    const existingChallenges = challengeStorage.get(key) || [];
    const challengeIndex = existingChallenges.findIndex(c => c.id === challenge.id);

    if (challengeIndex === -1) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Challenge not found'
      }, { status: 404 });
    }

    // Update the challenge
    const updatedChallenges = [...existingChallenges];
    updatedChallenges[challengeIndex] = {
      ...challenge,
      updatedAt: new Date().toISOString()
    };

    challengeStorage.set(key, updatedChallenges);

    // Forward update to external webhook if configured
    const externalWebhook = process.env.EXTERNAL_CHALLENGE_WEBHOOK;
    if (externalWebhook) {
      try {
        await fetch(externalWebhook, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Source': 'agentic-design-flow'
          },
          body: JSON.stringify({
            askKey: key,
            challenge: updatedChallenges[challengeIndex],
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Error forwarding to external webhook:', webhookError);
        // Don't fail the request if webhook fails
      }
    }

    return NextResponse.json<ApiResponse<Challenge>>({
      success: true,
      data: updatedChallenges[challengeIndex],
      message: 'Challenge updated successfully'
    });

  } catch (error) {
    console.error('Error updating challenge:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * DELETE /api/challenges/[key] - Clear challenges for an ASK session
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

    // Clear challenges for this ASK
    challengeStorage.delete(key);

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Challenges cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing challenges:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
