import { NextRequest } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { getAskSessionByKey } from '@/lib/asks';
import { normaliseMessageMetadata } from '@/lib/messages';
import { callModelProviderStream } from '@/lib/ai/providers';
import { createAgentLog, markAgentLogProcessing, completeAgentLog, failAgentLog } from '@/lib/ai/logs';
import { DEFAULT_MAX_OUTPUT_TOKENS } from '@/lib/ai/constants';
import { getAgentConfigForAsk } from '@/lib/ai/agent-config';
import type { AiAgentLog, AiModelConfig } from '@/types';

const CHAT_AGENT_SLUG = 'ask-conversation-response';

interface AskSessionRow {
  id: string;
  ask_key: string;
  question: string;
  description?: string | null;
  status?: string | null;
  system_prompt?: string | null;
  project_id?: string | null;
  challenge_id?: string | null;
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

export async function POST(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const { key } = params;

    if (!key || !isValidAskKey(key)) {
      return new Response('Invalid ASK key format', { status: 400 });
    }

    const supabase = getAdminSupabaseClient();

    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(
      supabase,
      key,
      'id, ask_key, question, description, status, system_prompt, project_id, challenge_id'
    );

    if (askError) {
      throw askError;
    }

    if (!askRow) {
      return new Response('ASK introuvable pour la clé fournie', { status: 404 });
    }

    // Fetch participants
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
        .from('users')
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
      .eq('ask_session_id', askRow.id)
      .order('created_at', { ascending: true });

    if (messageError) {
      throw messageError;
    }

    const messageUserIds = (messageRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    const additionalUserIds = messageUserIds.filter(id => !usersById[id]);

    if (additionalUserIds.length > 0) {
      const { data: extraUsers, error: extraUsersError } = await supabase
        .from('users')
        .select('id, email, full_name, first_name, last_name')
        .in('id', additionalUserIds);

      if (extraUsersError) {
        throw extraUsersError;
      }

      (extraUsers ?? []).forEach(user => {
        usersById[user.id] = user;
      });
    }

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
        throw error;
      }

      projectData = data ?? null;
    }

    let challengeData: ChallengeRow | null = null;
    if (askRow.challenge_id) {
      const { data, error } = await supabase
        .from('challenges')
        .select('id, name, system_prompt')
        .eq('id', askRow.challenge_id)
        .maybeSingle<ChallengeRow>();

      if (error) {
        throw error;
      }

      challengeData = data ?? null;
    }

    const participantSummaries = participants.map(p => ({ name: p.name, role: p.role ?? null }));

    const promptVariables = buildPromptVariables({
      ask: askRow,
      project: projectData,
      challenge: challengeData,
      messages,
      participants: participantSummaries,
    });

    // Get agent configuration with proper variable substitution
    const agentConfig = await getAgentConfigForAsk(
      supabase,
      askRow.id,
      {
        ask_question: promptVariables.ask_question || '',
        ask_description: promptVariables.ask_description || '',
        participant_name: promptVariables.participant_name || '',
        project_name: projectData?.name || '',
        challenge_name: challengeData?.name || '',
        previous_messages: promptVariables.message_history || '',
        delivery_mode: 'digital', // TODO: Get from session
        audience_scope: 'individual', // TODO: Get from session
        response_mode: 'simultaneous', // TODO: Get from session
      }
    );

    const prompts = {
      system: agentConfig.systemPrompt,
      user: agentConfig.userPrompt || `Basé sur l'historique de la conversation et le dernier message de l'utilisateur, fournis une réponse qui :

1. Reconnaît le contenu du dernier message
2. Fait le lien avec les échanges précédents si pertinent
3. Pose une question ou fait une observation qui fait avancer la discussion
4. Reste concis (2-3 phrases maximum)

Dernier message : ${promptVariables.latest_user_message || 'Aucun message'}

Réponds maintenant :`,
    };

    console.log('Using agent config:', agentConfig.modelConfig.provider);

    // Create a log entry for tracking
    let log: AiAgentLog | null = null;
    try {
      log = await createAgentLog(supabase, {
        agentId: agentConfig.agent?.id || null,
        askSessionId: askRow.id,
        messageId: null,
        interactionType: 'ask.chat.response',
        requestPayload: {
          agentSlug: CHAT_AGENT_SLUG,
          modelConfigId: agentConfig.modelConfig.id,
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
          variables: promptVariables,
        },
      });
    } catch (error) {
      console.error('Unable to create agent log for streaming response:', error);
    }

    console.log('System prompt:', prompts.system);
    console.log('User prompt:', prompts.user);
    console.log('Model config:', agentConfig.modelConfig);

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullContent = '';
          const startTime = Date.now();
          
          console.log('Starting streaming with model:', agentConfig.modelConfig.provider);
          
          // Mark log as processing
          if (log) {
            try {
              await markAgentLogProcessing(supabase, log.id, { modelConfigId: agentConfig.modelConfig.id });
            } catch (error) {
              console.error('Unable to mark agent log processing:', error);
            }
          }
          
          for await (const chunk of callModelProviderStream(
            agentConfig.modelConfig,
            {
              systemPrompt: prompts.system,
              userPrompt: prompts.user,
              maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
            }
          )) {
            console.log('Received chunk:', chunk.content, 'done:', chunk.done);
            if (chunk.content) {
              fullContent += chunk.content;
              
              // Send chunk to client
              const data = JSON.stringify({
                type: 'chunk',
                content: chunk.content,
                done: chunk.done
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }

            if (chunk.done) {
              // Store the complete message in database
              if (fullContent.trim()) {
                const aiMetadata = { senderName: 'Agent' } satisfies Record<string, unknown>;

                const { data: insertedRows, error: insertError } = await supabase
                  .from('messages')
                  .insert({
                    ask_session_id: askRow.id,
                    content: fullContent.trim(),
                    sender_type: 'ai',
                    message_type: 'text',
                    metadata: aiMetadata,
                  })
                  .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at')
                  .limit(1);

                if (insertError) {
                  console.error('Error storing AI response:', insertError);
                } else {
                  const inserted = insertedRows?.[0] as MessageRow | undefined;
                  if (inserted) {
                    const message = {
                      id: inserted.id,
                      askKey: askRow.ask_key,
                      askSessionId: inserted.ask_session_id,
                      content: inserted.content,
                      type: (inserted.message_type as any) ?? 'text',
                      senderType: 'ai' as const,
                      senderId: inserted.user_id ?? null,
                      senderName: 'Agent',
                      timestamp: inserted.created_at ?? new Date().toISOString(),
                      metadata: normaliseMessageMetadata(inserted.metadata),
                    };

                    // Send final message
                    const finalData = JSON.stringify({
                      type: 'message',
                      message: message
                    });
                    controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
                  }
                }
              }

              // Send completion signal
              controller.enqueue(encoder.encode(`data: {"type": "done"}\n\n`));
              
              // Complete the log
              if (log) {
                try {
                  await completeAgentLog(supabase, log.id, {
                    responsePayload: { content: fullContent, streaming: true },
                    latencyMs: Date.now() - startTime,
                  });
                } catch (error) {
                  console.error('Unable to complete agent log:', error);
                }
              }
              
              controller.close();
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);
          
          // Fail the log
          if (log) {
            try {
              await failAgentLog(supabase, log.id, parseErrorMessage(error));
            } catch (failError) {
              console.error('Unable to mark agent log as failed:', failError);
            }
          }
          
          const errorData = JSON.stringify({
            type: 'error',
            error: parseErrorMessage(error)
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in streaming endpoint:', error);
    return new Response(parseErrorMessage(error), { status: 500 });
  }
}
