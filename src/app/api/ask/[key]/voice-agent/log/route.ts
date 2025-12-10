import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createAgentLog, completeAgentLog } from '@/lib/ai/logs';
import { getAgentConfigForAsk, type PromptVariables } from '@/lib/ai/agent-config';
import { getAskSessionByKey, getOrCreateConversationThread } from '@/lib/asks';
import { getConversationPlanWithSteps } from '@/lib/ai/conversation-plan';
import { parseErrorMessage } from '@/lib/utils';
import { normaliseMessageMetadata } from '@/lib/messages';
import type { ApiResponse } from '@/types';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';

interface AskSessionRow {
  id: string;
  ask_key: string;
  question: string;
  description?: string | null;
  project_id?: string | null;
  challenge_id?: string | null;
  system_prompt?: string | null;
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

interface ParticipantRow {
  id: string;
  participant_name?: string | null;
  participant_email?: string | null;
  role?: string | null;
  description?: string | null;
  user_id?: string | null;
}

interface UserRow {
  id: string;
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
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

    // Fetch messages
    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at')
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

    // Format messages (same as agent-config/route.ts)
    const messages: any[] = (messageRows ?? []).map((row, index) => {
      const metadata = normaliseMessageMetadata(row.metadata);
      const user = row.user_id ? usersById[row.user_id] ?? null : null;

      const senderName = (() => {
        if (metadata && typeof metadata.senderName === 'string' && metadata.senderName.trim().length > 0) {
          return metadata.senderName;
        }

        if (row.sender_type === 'ai') {
          return 'Agent';
        }

        if (user) {
          if (user.full_name) {
            return user.full_name;
          }

          const nameParts = [user.first_name, user.last_name].filter(Boolean);
          if (nameParts.length > 0) {
            return nameParts.join(' ');
          }

          if (user.email) {
            return user.email;
          }
        }

        return `Participant ${index + 1}`;
      })();

      return {
        id: row.id,
        askKey: askRow.ask_key,
        askSessionId: row.ask_session_id,
        content: row.content,
        type: (row.message_type as any) ?? 'text',
        senderType: (row.sender_type as any) ?? 'user',
        senderId: row.user_id ?? null,
        senderName,
        timestamp: row.created_at ?? new Date().toISOString(),
        metadata: metadata,
      };
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

    const promptVariables = buildConversationAgentVariables({
      ask: askRow,
      project: projectData,
      challenge: challengeData,
      messages: conversationMessagesPayload,
      participants: participantSummaries,
      conversationPlan,
    });

    // Build agent variables (same as agent-config/route.ts)
    // IMPORTANT: Include system_prompt_* variables so getAgentConfigForAsk can use them for variable substitution
    const agentVariables: PromptVariables = {
      ask_key: askRow.ask_key,
      ask_question: promptVariables.ask_question || askRow.question,
      ask_description: promptVariables.ask_description || askRow.description || '',
      participants: promptVariables.participants || '',
      messages_json: JSON.stringify(conversationMessagesPayload),
      // Include system_prompt_* for proper variable fusion
      system_prompt_ask: promptVariables.system_prompt_ask || '',
      system_prompt_project: promptVariables.system_prompt_project || '',
      system_prompt_challenge: promptVariables.system_prompt_challenge || '',
    };

    // Get agent config with resolved system prompt
    // getAgentConfigForAsk will use system_prompt_* from variables for template substitution
    const agentConfig = await getAgentConfigForAsk(supabase, askRow.id, agentVariables);

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
          variables: agentVariables,
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

