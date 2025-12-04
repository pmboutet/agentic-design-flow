import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { executeAgent } from '@/lib/ai/service';
import { buildChatAgentVariables, DEFAULT_CHAT_AGENT_SLUG, type PromptVariables } from '@/lib/ai/agent-config';
import { getAskSessionByKey, getOrCreateConversationThread, getMessagesForThread } from '@/lib/asks';
import { getConversationPlanWithSteps, getActiveStep } from '@/lib/ai/conversation-plan';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';

const CHAT_AGENT_SLUG = DEFAULT_CHAT_AGENT_SLUG;
const CHAT_INTERACTION_TYPE = 'ask.chat.response.voice';

interface AskSessionRow {
  id: string;
  ask_key: string;
  question: string;
  description?: string | null;
  status?: string | null;
  system_prompt?: string | null;
  project_id?: string | null;
  challenge_id?: string | null;
  conversation_mode?: string | null;
}

interface ParticipantRow {
  id: string;
  participant_name?: string | null;
  participant_email?: string | null;
  role?: string | null;
  is_spokesperson?: boolean | null;
  user_id?: string | null;
  last_active?: string | null;
}

interface UserRow {
  id: string;
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

interface ProjectRow {
  id: string;
  name?: string | null;
  system_prompt?: string | null;
}

interface ChallengeRow {
  id: string;
  name?: string | null;
  system_prompt?: string | null;
}

function buildParticipantDisplayName(participant: ParticipantRow, user: UserRow | null, index: number): string {
  if (participant.participant_name) {
    return participant.participant_name;
  }

  if (user) {
    if (user.full_name && user.full_name.trim().length > 0) {
      return user.full_name;
    }

    const nameParts = [user.first_name, user.last_name].filter(Boolean);
    if (nameParts.length) {
      return nameParts.join(' ');
    }

    if (user.email) {
      return user.email;
    }
  }

  return `Participant ${index + 1}`;
}

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
      'id, ask_key, question, description, status, system_prompt, project_id, challenge_id, conversation_mode'
    );

    if (askError || !askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK session not found'
      }, { status: 404 });
    }

    // Get or create conversation thread
    // For voice mode, we need to determine the thread to check for existing messages
    const askConfig = {
      conversation_mode: askRow.conversation_mode ?? null,
    };

    // Try to get current user for thread determination
    let profileId: string | null = null;
    try {
      const { data: userResult } = await supabase.auth.getUser();
      if (userResult?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_id', userResult.user.id)
          .single();
        if (profile) {
          profileId = profile.id;
        }
      }
    } catch (error) {
      // Ignore auth errors - will use shared thread if needed
    }

    const { thread: conversationThread } = await getOrCreateConversationThread(
      supabase,
      askRow.id,
      profileId,
      askConfig
    );

    // Check if there are any messages in the thread
    let hasMessages = false;
    if (conversationThread) {
      const { messages: threadMessages } = await getMessagesForThread(
        supabase,
        conversationThread.id
      );
      hasMessages = (threadMessages ?? []).length > 0;
    } else {
      // Check for messages without thread
      const { data: messagesWithoutThread } = await supabase
        .from('messages')
        .select('id')
        .eq('ask_session_id', askRow.id)
        .is('conversation_thread_id', null)
        .limit(1);
      hasMessages = (messagesWithoutThread ?? []).length > 0;
    }

    // If no messages exist, initiate conversation with agent
    if (!hasMessages) {
      try {
        const { data: participantRows, error: participantError } = await supabase
          .from('ask_participants')
          .select('*')
          .eq('ask_session_id', askRow.id)
          .order('joined_at', { ascending: true });

        if (participantError) {
          throw participantError;
        }

        const participantUserIds = (participantRows ?? [])
          .map(row => row.user_id)
          .filter((value): value is string => Boolean(value));

        let usersById: Record<string, UserRow> = {};
        if (participantUserIds.length > 0) {
          const { data: userRows, error: userError } = await supabase
            .from('profiles')
            .select('id, email, full_name, first_name, last_name')
            .in('id', participantUserIds);

          if (userError) {
            throw userError;
          }

          usersById = (userRows ?? []).reduce<Record<string, UserRow>>((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {});
        }

        const participants = (participantRows ?? []).map((row, index) => {
          const user = row.user_id ? usersById[row.user_id] ?? null : null;
          return {
            id: row.id,
            name: buildParticipantDisplayName(row, user, index),
            role: row.role ?? null,
          };
        });

        const participantSummaries = participants.map(participant => ({
          name: participant.name,
          role: participant.role,
        }));

        let projectData: ProjectRow | null = null;
        if (askRow.project_id) {
          const { data, error } = await supabase
            .from('projects')
            .select('id, name, system_prompt')
            .eq('id', askRow.project_id)
            .maybeSingle<ProjectRow>();

          if (!error) {
            projectData = data ?? null;
          }
        }

        let challengeData: ChallengeRow | null = null;
        if (askRow.challenge_id) {
          const { data, error } = await supabase
            .from('challenges')
            .select('id, name, system_prompt')
            .eq('id', askRow.challenge_id)
            .maybeSingle<ChallengeRow>();

          if (!error) {
            challengeData = data ?? null;
          }
        }

        // Fetch conversation plan if thread exists
        let conversationPlan = null;
        if (conversationThread) {
          conversationPlan = await getConversationPlanWithSteps(supabase, conversationThread.id);
        }

        const agentVariables = buildConversationAgentVariables({
          ask: askRow,
          project: projectData,
          challenge: challengeData,
          messages: [],
          participants: participantSummaries,
          conversationPlan,
        });
        
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

          // Insert the initial AI message
          const { data: insertedRows, error: insertError } = await supabase
            .from('messages')
            .insert({
              ask_session_id: askRow.id,
              content: aiResponse,
              sender_type: 'ai',
              message_type: 'text',
              metadata: { senderName: 'Agent' },
              conversation_thread_id: conversationThread?.id ?? null,
              plan_step_id: initialPlanStepId,
            })
            .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id')
            .limit(1);

          if (insertError) {
            console.error('Voice agent init: Failed to insert initial message:', insertError);
          }
        }
      } catch (error) {
        // Don't fail the request - voice agent can still initialize
      }
    }

    // Build complete variables including system_prompt_* from database
    // This ensures consistency with other modes (text, streaming)
    const baseVariables = await buildChatAgentVariables(supabase, askRow.id);
    
    // For voice agent init, we need minimal variables but still include system_prompt_*
    // The full conversation context will be added later when messages are sent
    const promptVariables: PromptVariables = {
      ...baseVariables,
      // Additional variables can be added here if needed for voice init
    };

    // Execute agent to get voice agent response
    // executeAgent will use getAgentConfigForAsk internally which handles system_prompt_* correctly
    const result = await executeAgent({
      supabase,
      agentSlug: CHAT_AGENT_SLUG,
      askSessionId: askRow.id,
      interactionType: CHAT_INTERACTION_TYPE,
      variables: promptVariables,
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

