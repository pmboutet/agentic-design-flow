import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { executeAgent } from '@/lib/ai/service';
import { getAskSessionByKey, getOrCreateConversationThread, getMessagesForThread } from '@/lib/asks';
import { parseErrorMessage } from '@/lib/utils';
import { normaliseMessageMetadata } from '@/lib/messages';
import type { ApiResponse, Message } from '@/types';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';
import { generateConversationPlan, createConversationPlan, getConversationPlanWithSteps } from '@/lib/ai/conversation-plan';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';

interface AskSessionRow {
  id: string;
  ask_key: string;
  question: string;
  description?: string | null;
  status?: string | null;
  system_prompt?: string | null;
  project_id?: string | null;
  challenge_id?: string | null;
  audience_scope?: string | null;
  response_mode?: string | null;
}

interface MessageRow {
  id: string;
  ask_session_id: string;
  user_id?: string | null;
  sender_type?: string | null;
  content: string;
  message_type?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  conversation_thread_id?: string | null;
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
      'id, ask_key, question, description, status, system_prompt, project_id, challenge_id, audience_scope, response_mode'
    );

    if (askError || !askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK session not found'
      }, { status: 404 });
    }

    // Get or create conversation thread
    const askConfig = {
      audience_scope: askRow.audience_scope ?? null,
      response_mode: askRow.response_mode ?? null,
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
      console.log('⚠️ Init conversation: Could not get user profile, will use shared thread if needed');
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

    // If messages already exist, return early
    if (hasMessages) {
      return NextResponse.json<ApiResponse<{ message: Message | null }>>({
        success: true,
        data: {
          message: null,
        },
        message: 'Conversation already initiated'
      });
    }

    // Initiate conversation with agent
    console.log('💬 POST /api/ask/[key]/init: Initiating conversation with agent');
    
    // Build participants context for prompt
    const { data: participantRows, error: participantError } = await supabase
      .from('ask_participants')
      .select('*')
      .eq('ask_session_id', askRow.id)
      .order('joined_at', { ascending: true });

    if (participantError) {
      console.error('❌ POST /api/ask/[key]/init: Failed to fetch participants:', participantError);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Failed to prepare conversation context',
      }, { status: 500 });
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
        console.error('❌ POST /api/ask/[key]/init: Failed to fetch participant profiles:', userError);
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Failed to prepare conversation context',
        }, { status: 500 });
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

    // Fetch related prompts context
    let projectData: ProjectRow | null = null;
    if (askRow.project_id) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, system_prompt')
        .eq('id', askRow.project_id)
        .maybeSingle<ProjectRow>();

      if (error) {
        console.error('❌ POST /api/ask/[key]/init: Failed to fetch project:', error);
      } else {
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

      if (error) {
        console.error('❌ POST /api/ask/[key]/init: Failed to fetch challenge:', error);
      } else {
        challengeData = data ?? null;
      }
    }

    // Generate conversation plan if it doesn't exist yet
    let conversationPlan = null;
    if (conversationThread) {
      const adminClient = getAdminSupabaseClient();
      console.log('🎯 POST /api/ask/[key]/init: Checking for existing conversation plan');
      conversationPlan = await getConversationPlanWithSteps(adminClient, conversationThread.id);
      
      if (!conversationPlan) {
        console.log('📋 POST /api/ask/[key]/init: Generating new conversation plan');
        try {
          // Build variables for plan generation
          const planGenerationVariables = {
            ask_key: askRow.ask_key,
            ask_question: askRow.question,
            ask_description: askRow.description ?? '',
            system_prompt_ask: askRow.system_prompt ?? '',
            system_prompt_project: projectData?.system_prompt ?? '',
            system_prompt_challenge: challengeData?.system_prompt ?? '',
            participants: participantSummaries.map(p => p.name).join(', '),
            participants_list: participantSummaries,
          };

          const planData = await generateConversationPlan(
            adminClient,
            askRow.id,
            planGenerationVariables
          );

          conversationPlan = await createConversationPlan(
            adminClient,
            conversationThread.id,
            planData
          );

          console.log('✅ POST /api/ask/[key]/init: Conversation plan created with', planData.steps.length, 'steps');
        } catch (planError) {
          console.error('⚠️ POST /api/ask/[key]/init: Failed to generate conversation plan, continuing without it:', planError);
          // Continue without the plan - it's an enhancement, not a requirement
        }
      } else {
        console.log('✅ POST /api/ask/[key]/init: Using existing conversation plan');
      }
    }

    // Build variables for agent with full prompt parity
    const agentVariables = buildConversationAgentVariables({
      ask: askRow,
      project: projectData,
      challenge: challengeData,
      messages: [],
      participants: participantSummaries,
      conversationPlan,
    });
    
    // Execute agent to get initial response
    console.log('🔧 POST /api/ask/[key]/init: Calling executeAgent with variables:', {
      agentSlug: 'ask-conversation-response',
      askSessionId: askRow.id,
      variableKeys: Object.keys(agentVariables),
      messages_json: agentVariables.messages_json,
      participants: agentVariables.participants,
    });
    
    const agentResult = await executeAgent({
      supabase,
      agentSlug: 'ask-conversation-response',
      askSessionId: askRow.id,
      interactionType: 'ask.chat.response',
      variables: agentVariables,
    });

    console.log('📥 POST /api/ask/[key]/init: Agent result:', {
      hasContent: !!agentResult.content,
      contentType: typeof agentResult.content,
      contentLength: agentResult.content ? String(agentResult.content).length : 0,
      contentPreview: agentResult.content ? String(agentResult.content).substring(0, 100) : null,
      fullResult: agentResult,
    });

    if (typeof agentResult.content !== 'string' || agentResult.content.trim().length === 0) {
      console.error('❌ POST /api/ask/[key]/init: Invalid agent response:', agentResult);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Agent did not return a valid response'
      }, { status: 500 });
    }

    const aiResponse = agentResult.content.trim();
    
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
      })
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id')
      .limit(1);

    if (insertError || !insertedRows || insertedRows.length === 0) {
      console.error('❌ POST /api/ask/[key]/init: Failed to insert initial message:', insertError);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Failed to insert initial message'
      }, { status: 500 });
    }

    const inserted = insertedRows[0] as MessageRow;
    const initialMessage: Message = {
      id: inserted.id,
      askKey: askRow.ask_key,
      askSessionId: inserted.ask_session_id,
      conversationThreadId: (inserted as any).conversation_thread_id ?? null,
      content: inserted.content,
      type: (inserted.message_type as Message['type']) ?? 'text',
      senderType: 'ai',
      senderId: inserted.user_id ?? null,
      senderName: 'Agent',
      timestamp: inserted.created_at ?? new Date().toISOString(),
      metadata: normaliseMessageMetadata(inserted.metadata),
    };

    console.log('✅ POST /api/ask/[key]/init: Initial conversation message created:', initialMessage.id);

    return NextResponse.json<ApiResponse<{ message: Message }>>({
      success: true,
      data: {
        message: initialMessage,
      },
    });

  } catch (error) {
    console.error('Error initiating conversation:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
