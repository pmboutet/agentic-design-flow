import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { executeAgent } from '@/lib/ai/service';
import { DEFAULT_CHAT_AGENT_SLUG } from '@/lib/ai/agent-config';
import { getAskSessionByKey, getOrCreateConversationThread, getMessagesForThread, resolveThreadUserId } from '@/lib/asks';
import { getConversationPlanWithSteps, getActiveStep, ensureConversationPlanExists } from '@/lib/ai/conversation-plan';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';
import {
  buildParticipantDisplayName,
  buildMessageSummary,
  buildParticipantSummary,
  fetchUsersByIds,
  fetchElapsedTime,
  type AskSessionRow,
  type UserRow,
  type ParticipantRow,
  type ProjectRow,
  type ChallengeRow,
  type MessageRow,
} from '@/lib/conversation-context';

const CHAT_AGENT_SLUG = DEFAULT_CHAT_AGENT_SLUG;
const CHAT_INTERACTION_TYPE = 'ask.chat.response.voice';

// Types imported from @/lib/conversation-context:
// - AskSessionRow, UserRow, ParticipantRow, ProjectRow, ChallengeRow, MessageRow
// - buildParticipantDisplayName (unified function)
// - buildMessageSummary (unified function)
// - buildParticipantSummary (unified function)
// - fetchUsersByIds (utility function)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const supabase = await createServerSupabaseClient();

    // Get ASK session
    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(
      supabase,
      key,
      'id, ask_key, question, description, status, system_prompt, project_id, challenge_id, conversation_mode, expected_duration_minutes'
    );

    if (askError || !askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK session not found'
      }, { status: 404 });
    }

    // Fetch participants FIRST via RPC (needed for thread resolution and voice agent)
    const adminClient = getAdminSupabaseClient();
    const { data: participantRowsJson, error: participantError } = await adminClient.rpc('get_participants_by_ask_session', {
      p_ask_session_id: askRow.id,
    });

    if (participantError) {
      throw participantError;
    }

    const participantRows = (participantRowsJson as ParticipantRow[] | null) ?? [];

    // Try to get current user for thread determination via RPC
    const isDevBypass = process.env.IS_DEV === 'true';
    let profileId: string | null = null;
    try {
      const { data: userResult } = await supabase.auth.getUser();
      if (userResult?.user) {
        const { data: profileJson } = await adminClient.rpc('get_profile_by_auth_id', {
          p_auth_id: userResult.user.id,
        });
        const profile = profileJson as { id: string } | null;
        if (profile) {
          profileId = profile.id;
        }
      }
    } catch (error) {
      // Ignore auth errors - will use resolveThreadUserId fallback
    }

    // Get or create conversation thread using resolveThreadUserId for proper thread assignment
    const askConfig = {
      conversation_mode: askRow.conversation_mode ?? null,
    };

    // Use resolveThreadUserId for consistent thread assignment across all routes
    // Map participantRows to ensure they conform to Participant interface
    const participantsForThread = participantRows.map(p => ({
      ...p,
      user_id: p.user_id ?? null,
    }));
    const threadProfileId = resolveThreadUserId(
      profileId,
      askRow.conversation_mode,
      participantsForThread,
      isDevBypass
    );

    const { thread: conversationThread } = await getOrCreateConversationThread(
      supabase,
      askRow.id,
      threadProfileId,
      askConfig
    );

    const participantUserIds = (participantRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    let usersById: Record<string, UserRow> = {};
    if (participantUserIds.length > 0) {
      // Use RPC to bypass RLS in production
      const { data: userRowsJson, error: userError } = await adminClient.rpc('get_profiles_by_ids', {
        p_user_ids: participantUserIds,
      });

      if (userError) {
        throw userError;
      }

      const userRows = (userRowsJson as UserRow[] | null) ?? [];
      usersById = userRows.reduce<Record<string, UserRow>>((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});
    }

    // Build participant summaries using unified function for consistent mapping
    const participantSummaries = (participantRows ?? []).map((row, index) => {
      const user = row.user_id ? usersById[row.user_id] ?? null : null;
      return buildParticipantSummary(row as ParticipantRow, user, index);
    });

    // Fetch project data via RPC
    let projectData: ProjectRow | null = null;
    if (askRow.project_id) {
      const { data: projectJson, error } = await adminClient.rpc('get_project_by_id', {
        p_project_id: askRow.project_id,
      });

      if (!error) {
        projectData = (projectJson as ProjectRow | null) ?? null;
      }
    }

    // Fetch challenge data via RPC
    let challengeData: ChallengeRow | null = null;
    if (askRow.challenge_id) {
      const { data: challengeJson, error } = await adminClient.rpc('get_challenge_by_id', {
        p_challenge_id: askRow.challenge_id,
      });

      if (!error) {
        challengeData = (challengeJson as ChallengeRow | null) ?? null;
      }
    }

    // Ensure a conversation plan exists (centralized function handles generation if needed)
    let conversationPlan = null;
    if (conversationThread) {
      try {
        const adminClient = getAdminSupabaseClient();
        conversationPlan = await ensureConversationPlanExists(
          adminClient,
          conversationThread.id,
          {
            askRow,
            projectData,
            challengeData,
            participantSummaries,
          }
        );
      } catch (planError) {
        // IMPORTANT: Plan generation is REQUIRED - fail if it doesn't work
        console.error('❌ Voice agent init: Failed to generate conversation plan:', planError);
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Failed to generate conversation plan. Please try again.'
        }, { status: 500 });
      }
    }

    // Check if there are any messages in the thread
    let hasMessages = false;
    let messageRows: MessageRow[] = [];
    if (conversationThread) {
      const { messages: threadMessages } = await getMessagesForThread(
        supabase,
        conversationThread.id
      );
      messageRows = (threadMessages ?? []) as MessageRow[];
      hasMessages = messageRows.length > 0;
    } else {
      // Check for messages without thread via RPC
      const { data: messagesWithoutThreadJson } = await adminClient.rpc('get_messages_without_thread', {
        p_ask_session_id: askRow.id,
      });
      const messagesWithoutThread = (messagesWithoutThreadJson as { id: string }[] | null) ?? [];
      hasMessages = messagesWithoutThread.length > 0;
    }

    // Fetch additional user data for message senders not already in usersById
    const messageUserIds = messageRows
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value))
      .filter(id => !usersById[id]);

    if (messageUserIds.length > 0) {
      const additionalUsers = await fetchUsersByIds(supabase, messageUserIds);
      Object.assign(usersById, additionalUsers);
    }

    // Build message summaries using unified function for consistent mapping
    // This ensures senderName logic and planStepId are consistent across all modes
    const messages = messageRows.map((row, index) => {
      const user = row.user_id ? usersById[row.user_id] ?? null : null;
      return buildMessageSummary(row, user, index);
    });

    // Fetch elapsed times using centralized helper (DRY)
    const { elapsedActiveSeconds, stepElapsedActiveSeconds } = await fetchElapsedTime({
      supabase,
      askSessionId: askRow.id,
      profileId,
      conversationPlan,
      participantRows: participantRows ?? [],
      adminClient: getAdminSupabaseClient(),
    });

    // Find the current participant name from profileId
    const currentParticipant = profileId
      ? participantSummaries.find((p, index) => {
          const participantRow = (participantRows ?? [])[index];
          return participantRow?.user_id === profileId;
        })
      : null;

    // Build agent variables using THE SAME function as text/stream mode
    // This ensures 100% consistency between voice and text modes
    const agentVariables = buildConversationAgentVariables({
      ask: {
        ...askRow,
        conversation_mode: askRow.conversation_mode ?? null,
      },
      project: projectData,
      challenge: challengeData,
      messages,
      participants: participantSummaries,
      currentParticipantName: currentParticipant?.name ?? null,
      conversationPlan,
      elapsedActiveSeconds,
      stepElapsedActiveSeconds,
    });

    // If no messages exist, initiate conversation with agent
    if (!hasMessages) {
      try {
        // Execute agent to get initial response
        // Use 'ask.chat.response' for initial message (same as text mode)
        const agentResult = await executeAgent({
          supabase,
          agentSlug: CHAT_AGENT_SLUG,
          askSessionId: askRow.id,
          interactionType: 'ask.chat.response',
          variables: agentVariables,
        });

        if (typeof agentResult.content === 'string' && agentResult.content.trim().length > 0) {
          const aiResponse = agentResult.content.trim();

          // Get the currently active plan step to link this message
          let initialPlanStepId: string | null = null;
          if (conversationPlan) {
            try {
              const adminClient = getAdminSupabaseClient();
              const activeStep = await getActiveStep(adminClient, conversationPlan.id);
              if (activeStep) {
                initialPlanStepId = activeStep.id;
              }
            } catch (stepError) {
              console.warn('⚠️ Voice agent init: Failed to get active step for message linking:', stepError);
            }
          }

          // Insert the initial AI message via RPC
          const { error: insertError } = await adminClient.rpc('insert_ai_message', {
            p_ask_session_id: askRow.id,
            p_conversation_thread_id: conversationThread?.id ?? null,
            p_content: aiResponse,
            p_sender_name: 'Agent',
          });

          if (insertError) {
            console.error('Voice agent init: Failed to insert initial message:', insertError);
          }
        }
      } catch (error) {
        // Don't fail the request - voice agent can still initialize
        console.error('Voice agent init: Failed to generate initial message:', error);
      }
    }

    // Execute agent to get voice agent response
    // Uses the same agentVariables as the initial message for consistency
    const result = await executeAgent({
      supabase,
      agentSlug: CHAT_AGENT_SLUG,
      askSessionId: askRow.id,
      interactionType: CHAT_INTERACTION_TYPE,
      variables: agentVariables,
    });

    // Check if result is a voice agent response
    if ('voiceAgent' in result) {
      return NextResponse.json<ApiResponse<{ logId: string }>>({
        success: true,
        data: {
          logId: result.logId,
        },
      });
    }

    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Voice agent initialization failed'
    }, { status: 500 });

  } catch (error) {
    console.error('Error initializing voice agent:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
