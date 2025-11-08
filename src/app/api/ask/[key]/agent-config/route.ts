import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getAgentConfigForAsk, type PromptVariables } from '@/lib/ai/agent-config';
import { isValidAskKey } from '@/lib/utils';
import { normaliseMessageMetadata } from '@/lib/messages';

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
  user_id?: string | null;
}

interface UserRow {
  id: string;
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
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
}

function formatMessageHistory(messages: any[]): string {
  return messages
    .map(message => {
      const timestamp = (() => {
        const date = new Date(message.timestamp);
        if (Number.isNaN(date.getTime())) {
          return '';
        }
        return date.toISOString();
      })();

      const sender = message.senderName ?? (message.senderType === 'ai' ? 'Agent IA' : 'Participant');
      return `${timestamp ? `[${timestamp}] ` : ''}${sender}: ${message.content}`;
    })
    .join('\n');
}

function buildPromptVariables(options: {
  ask: AskSessionRow;
  project: ProjectRow | null;
  challenge: ChallengeRow | null;
  messages: any[];
  participants: { name: string; role?: string | null }[];
}): Record<string, string | null | undefined> {
  const history = formatMessageHistory(options.messages);
  const lastUserMessage = [...options.messages].reverse().find(message => message.senderType === 'user');

  const participantsSummary = options.participants
    .map(participant => participant.role ? `${participant.name} (${participant.role})` : participant.name)
    .join(', ');

  return {
    ask_key: options.ask.ask_key,
    ask_question: options.ask.question,
    ask_description: options.ask.description ?? '',
    system_prompt_project: options.project?.system_prompt ?? '',
    system_prompt_challenge: options.challenge?.system_prompt ?? '',
    system_prompt_ask: options.ask.system_prompt ?? '',
    message_history: history,
    latest_user_message: lastUserMessage?.content ?? '',
    participant_name: lastUserMessage?.senderName ?? lastUserMessage?.metadata?.senderName ?? '',
    participants: participantsSummary,
  } satisfies Record<string, string | null | undefined>;
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  
  if (!isValidAskKey(key)) {
    return NextResponse.json(
      { success: false, error: 'Invalid ask key format' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: askSession, error: askError } = await supabase
      .from('ask_sessions')
      .select('id, ask_key, question, description, project_id, challenge_id, system_prompt')
      .eq('ask_key', key)
      .maybeSingle<AskSessionRow>();

    if (askError) {
      throw new Error(`Failed to fetch ASK session: ${askError.message}`);
    }

    if (!askSession) {
      return NextResponse.json(
        { success: false, error: 'ASK session not found' },
        { status: 404 }
      );
    }

    // Fetch participants
    const { data: participantRows, error: participantError } = await supabase
      .from('ask_participants')
      .select('*')
      .eq('ask_session_id', askSession.id)
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
        isSpokesperson: Boolean(row.is_spokesperson),
        isActive: true,
      };
    });

    // Fetch messages
    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at')
      .eq('ask_session_id', askSession.id)
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

    // Format messages (same as stream/route.ts)
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
        askKey: askSession.ask_key,
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
    if (askSession.project_id) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, system_prompt')
        .eq('id', askSession.project_id)
        .maybeSingle<ProjectRow>();

      if (error) {
        console.error('Error fetching project:', error);
      } else {
        projectData = data ?? null;
      }
    }

    let challengeData: ChallengeRow | null = null;
    if (askSession.challenge_id) {
      const { data, error } = await supabase
        .from('challenges')
        .select('id, name, system_prompt')
        .eq('id', askSession.challenge_id)
        .maybeSingle<ChallengeRow>();

      if (error) {
        console.error('Error fetching challenge:', error);
      } else {
        challengeData = data ?? null;
      }
    }

    const participantSummaries = participants.map(p => ({ name: p.name, role: p.role ?? null }));

    const promptVariables = buildPromptVariables({
      ask: askSession,
      project: projectData,
      challenge: challengeData,
      messages,
      participants: participantSummaries,
    });

    // Format messages as JSON (same as stream/route.ts)
    const conversationMessagesPayload = messages.map(message => ({
      id: message.id,
      senderType: message.senderType,
      senderName: message.senderName,
      content: message.content,
      timestamp: message.timestamp,
    }));

    // Build agent variables (same as stream/route.ts)
    const agentVariables: PromptVariables = {
      ask_key: askSession.ask_key,
      ask_question: promptVariables.ask_question || askSession.question,
      ask_description: promptVariables.ask_description || askSession.description || '',
      participants: promptVariables.participants || '',
      messages_json: JSON.stringify(conversationMessagesPayload),
    };

    const agentConfig = await getAgentConfigForAsk(supabase, askSession.id, agentVariables);

    return NextResponse.json({
      success: true,
      data: {
        systemPrompt: agentConfig.systemPrompt,
        userPrompt: agentConfig.userPrompt,
        modelConfig: agentConfig.modelConfig ? {
          id: agentConfig.modelConfig.id,
          provider: agentConfig.modelConfig.provider,
          model: agentConfig.modelConfig.model,
          deepgramSttModel: (agentConfig.modelConfig as any).deepgramSttModel,
          deepgramTtsModel: (agentConfig.modelConfig as any).deepgramTtsModel,
          deepgramLlmProvider: (agentConfig.modelConfig as any).deepgramLlmProvider,
          deepgramLlmModel: (agentConfig.modelConfig as any).deepgramLlmModel,
        } : null,
      },
    });
  } catch (error) {
    console.error('Error fetching agent config:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch agent configuration',
      },
      { status: 500 }
    );
  }
}

