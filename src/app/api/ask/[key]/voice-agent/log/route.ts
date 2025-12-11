import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createAgentLog, completeAgentLog } from '@/lib/ai/logs';
import { getAgentConfigForAsk, type PromptVariables } from '@/lib/ai/agent-config';
import { getAskSessionByKey, getOrCreateConversationThread } from '@/lib/asks';
import { getConversationPlanWithSteps } from '@/lib/ai/conversation-plan';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';
import {
  buildParticipantDisplayName,
  buildDetailedMessage,
  fetchUsersByIds,
  type AskSessionRow,
  type UserRow,
  type ParticipantRow,
  type ProjectRow,
  type ChallengeRow,
  type MessageRow,
} from '@/lib/conversation-context';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const body = await request.json().catch(() => ({}));
    const typedBody = body as {
      role: 'user' | 'agent';
      content: string;
      messageId?: string | null;
      logId?: string;
    };

    const { role, content, messageId, logId } = typedBody;

    if (!role || !content) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Missing role or content'
      }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // Get ASK session with all needed fields
    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(
      supabase,
      key,
      'id, ask_key, question, description, project_id, challenge_id, system_prompt'
    );

    if (askError || !askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK session not found'
      }, { status: 404 });
    }

    // Fetch participants
    const { data: participantRows, error: participantError } = await supabase
      .from('ask_participants')
      .select('*')
      .eq('ask_session_id', askRow.id)
      .order('joined_at', { ascending: true });

    if (participantError) {
      console.error('Error fetching participants:', participantError);
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
        console.error('Error fetching users:', userError);
      } else {
        usersById = (userRows ?? []).reduce<Record<string, UserRow>>((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {});
      }
    }

    const participants = (participantRows ?? []).map((row, index) => {
      const user = row.user_id ? usersById[row.user_id] ?? null : null;
      return {
        id: row.id,
        name: buildParticipantDisplayName(row, user, index),
        email: row.participant_email ?? user?.email ?? null,
        role: row.role ?? null,
        description: row.description ?? null,
        isSpokesperson: Boolean(row.is_spokesperson),
        isActive: true,
      };
    });

    // Fetch messages (include plan_step_id for step variable support)
    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, plan_step_id')
      .eq('ask_session_id', askRow.id)
      .order('created_at', { ascending: true });

    if (messageError) {
      console.error('Error fetching messages:', messageError);
    }

    const messageUserIds = (messageRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    const additionalUserIds = messageUserIds.filter(id => !usersById[id]);

    if (additionalUserIds.length > 0) {
      const { data: extraUsers, error: extraUsersError } = await supabase
        .from('profiles')
        .select('id, email, full_name, first_name, last_name')
        .in('id', additionalUserIds);

      if (extraUsersError) {
        console.error('Error fetching additional users:', extraUsersError);
      } else {
        (extraUsers ?? []).forEach(user => {
          usersById[user.id] = user;
        });
      }
    }

    // Format messages using unified buildDetailedMessage for consistent mapping
    const messages = (messageRows ?? []).map((row, index) => {
      const user = row.user_id ? usersById[row.user_id] ?? null : null;
      return buildDetailedMessage(row as MessageRow, user, index, askRow.ask_key);
    });

    // Fetch project and challenge data
    let projectData: ProjectRow | null = null;
    if (askRow.project_id) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, system_prompt')
        .eq('id', askRow.project_id)
        .maybeSingle<ProjectRow>();

      if (error) {
        console.error('Error fetching project:', error);
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
        console.error('Error fetching challenge:', error);
      } else {
        challengeData = data ?? null;
      }
    }

    const participantSummaries = participants.map(p => ({ name: p.name, role: p.role ?? null, description: p.description ?? null }));

    // Format messages as JSON (same as agent-config/route.ts)
    const conversationMessagesPayload = messages.map(message => ({
      id: message.id,
      senderType: message.senderType,
      senderName: message.senderName,
      content: message.content,
      timestamp: message.timestamp,
    }));

    // Get conversation thread and plan
    const { thread: conversationThread } = await getOrCreateConversationThread(
      supabase,
      askRow.id,
      null, // profileId - not needed for fetching plan
      { conversation_mode: null }
    );

    let conversationPlan = null;
    if (conversationThread) {
      conversationPlan = await getConversationPlanWithSteps(supabase, conversationThread.id);
      if (conversationPlan && conversationPlan.plan_data) {
        console.log('📋 Voice agent log: Loaded conversation plan with', conversationPlan.plan_data.steps.length, 'steps');
      }
    }

    // Use centralized function for ALL prompt variables - no manual overrides
    const promptVariables = buildConversationAgentVariables({
      ask: askRow,
      project: projectData,
      challenge: challengeData,
      messages: conversationMessagesPayload,
      participants: participantSummaries,
      conversationPlan,
    });

    // Pass the complete promptVariables directly - no manual subset
    const agentConfig = await getAgentConfigForAsk(supabase, askRow.id, promptVariables);

    if (!agentConfig.modelConfig) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Failed to load agent configuration'
      }, { status: 500 });
    }

    if (role === 'user') {
      // Create a new log for user message with resolved system prompt
      const log = await createAgentLog(supabase, {
        agentId: agentConfig.agent?.id || null,
        askSessionId: askRow.id,
        messageId: messageId || null,
        interactionType: 'ask.chat.response.voice',
        requestPayload: {
          agentSlug: 'ask-conversation-response',
          modelConfigId: agentConfig.modelConfig.id,
          systemPrompt: agentConfig.systemPrompt, // Include resolved system prompt
          userPrompt: agentConfig.userPrompt,
          userMessage: content,
          role: 'user',
          variables: promptVariables,
        },
      });

      return NextResponse.json<ApiResponse<{ logId: string }>>({
        success: true,
        data: {
          logId: log.id,
        },
      });
    } else {
      // Complete the log for agent response
      if (!logId) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Missing logId for agent response'
        }, { status: 400 });
      }

      await completeAgentLog(supabase, logId, {
        responsePayload: {
          agentMessage: content,
          role: 'agent',
        },
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { logId },
      });
    }

  } catch (error) {
    console.error('Error handling voice agent log:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

