import { NextRequest } from 'next/server';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { getAskSessionByKey, getOrCreateConversationThread, getMessagesForThread } from '@/lib/asks';
import { normaliseMessageMetadata } from '@/lib/messages';
import { callModelProviderStream } from '@/lib/ai/providers';
import { createAgentLog, markAgentLogProcessing, completeAgentLog, failAgentLog } from '@/lib/ai/logs';
import { DEFAULT_MAX_OUTPUT_TOKENS } from '@/lib/ai/constants';
import { getChatAgentConfig, DEFAULT_CHAT_AGENT_SLUG, type PromptVariables, type AgentConfigResult } from '@/lib/ai/agent-config';
import type { AiAgentLog, Insight } from '@/types';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

interface InsightDetectionResponse {
  success: boolean;
  data?: { insights?: Insight[] };
  error?: string;
}

const CHAT_AGENT_SLUG = DEFAULT_CHAT_AGENT_SLUG;

interface AskSessionRow {
  id: string;
  ask_key: string;
  question: string;
  description?: string | null;
  status?: string | null;
  system_prompt?: string | null;
  project_id?: string | null;
  challenge_id?: string | null;
  is_anonymous?: boolean | null;
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

function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = ((error as PostgrestError).code ?? '').toString().toUpperCase();
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302') {
    return true;
  }

  const message = ((error as { message?: string }).message ?? '').toString().toLowerCase();
  return message.includes('permission denied') || message.includes('unauthorized');
}

function permissionDeniedResponse(): Response {
  return new Response('Accès non autorisé à cette ASK', { status: 403 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    if (!key || !isValidAskKey(key)) {
      return new Response('Invalid ASK key format', { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const isDevBypass = process.env.IS_DEV === 'true';

    let dataClient: SupabaseClient = supabase;
    let adminClient: SupabaseClient | null = null;
    const getAdminClient = async () => {
      if (!adminClient) {
        const { getAdminSupabaseClient } = await import('@/lib/supabaseAdmin');
        adminClient = getAdminSupabaseClient();
      }
      return adminClient;
    };

    const inviteToken = request.headers.get('X-Invite-Token');
    let profileId: string | null = null;
    let tokenAskSessionId: string | null = null;
    let authenticatedViaToken = false;

    if (!isDevBypass && inviteToken) {
      const admin = await getAdminClient();
      const { data: participant, error: tokenError } = await admin
        .from('ask_participants')
        .select('id, user_id, ask_session_id')
        .eq('invite_token', inviteToken)
        .maybeSingle();

      if (tokenError) {
        console.error('❌ Error validating invite token for streaming:', tokenError);
        return new Response('Token invalide', { status: 403 });
      }

      if (!participant || !participant.user_id) {
        console.error('❌ Invite token missing linked user profile for streaming');
        return new Response("Ce lien d'invitation n'est associé à aucun profil utilisateur. Contactez votre administrateur.", { status: 403 });
      }

      profileId = participant.user_id;
      tokenAskSessionId = participant.ask_session_id;
      dataClient = admin;
      authenticatedViaToken = true;
    }

    if (!isDevBypass && !profileId) {
      const { data: userResult, error: userError } = await supabase.auth.getUser();

      if (userError) {
        if (isPermissionDenied(userError)) {
          return permissionDeniedResponse();
        }
        throw userError;
      }

      const user = userResult?.user;

      if (!user) {
        return new Response('Authentification requise', { status: 401 });
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_id', user.id)
        .single();

      if (profileError || !profile) {
        return new Response('Profil utilisateur introuvable', { status: 401 });
      }

      profileId = profile.id;
    }

    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow & { audience_scope?: string | null; response_mode?: string | null }>(
      dataClient,
      key,
      'id, ask_key, question, description, status, system_prompt, project_id, challenge_id, is_anonymous, audience_scope, response_mode'
    );

    if (askError) {
      if (isPermissionDenied(askError)) {
        return permissionDeniedResponse();
      }
      throw askError;
    }

    if (!askRow) {
      return new Response('ASK introuvable pour la clé fournie', { status: 404 });
    }

    if (authenticatedViaToken && tokenAskSessionId && tokenAskSessionId !== askRow.id) {
      console.error('Invite token does not belong to this ASK session', { tokenAskSessionId, requestedId: askRow.id });
      return permissionDeniedResponse();
    }

    if (!isDevBypass && profileId && !authenticatedViaToken) {
      const isAnonymous = askRow.is_anonymous === true;

      // Check if user is a participant
      const { data: membership, error: membershipError } = await supabase
        .from('ask_participants')
        .select('id, user_id, role, is_spokesperson')
        .eq('ask_session_id', askRow.id)
        .eq('user_id', profileId)
        .maybeSingle();

      if (membershipError) {
        if (isPermissionDenied(membershipError)) {
          return permissionDeniedResponse();
        }
        throw membershipError;
      }

      // If session allows anonymous participation, allow access even if not in participants list
      // Otherwise, require explicit participation
      if (!membership && !isAnonymous) {
        return permissionDeniedResponse();
      }

      // If anonymous and user is not yet a participant, create one automatically
      if (isAnonymous && !membership) {
        const { error: insertError } = await supabase
          .from('ask_participants')
          .insert({
            ask_session_id: askRow.id,
            user_id: profileId,
            role: 'participant',
          });

        if (insertError && !isPermissionDenied(insertError)) {
          // Log but don't fail - RLS policies will handle access
          console.warn('Failed to auto-add participant to anonymous session:', insertError);
        }
      }
    }

    // Fetch participants
    const { data: participantRows, error: participantError } = await dataClient
      .from('ask_participants')
      .select('*')
      .eq('ask_session_id', askRow.id)
      .order('joined_at', { ascending: true });

    if (participantError) {
      if (isPermissionDenied(participantError)) {
        return permissionDeniedResponse();
      }
      throw participantError;
    }

    const participantUserIds = (participantRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    let usersById: Record<string, UserRow> = {};

    if (participantUserIds.length > 0) {
      const { data: userRows, error: userError } = await dataClient
        .from('profiles')
        .select('id, email, full_name, first_name, last_name')
        .in('id', participantUserIds);

      if (userError) {
        if (isPermissionDenied(userError)) {
          return permissionDeniedResponse();
        }
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

    // Get or create conversation thread
    const askConfig = {
      audience_scope: askRow.audience_scope ?? null,
      response_mode: askRow.response_mode ?? null,
    };
    
    const { thread: conversationThread, error: threadError } = await getOrCreateConversationThread(
      dataClient,
      askRow.id,
      profileId,
      askConfig
    );

    if (threadError) {
      if (isPermissionDenied(threadError)) {
        return permissionDeniedResponse();
      }
      throw threadError;
    }

    // Get messages for the thread (or all messages if no thread for backward compatibility)
    let messageRows: any[] = [];
    if (conversationThread) {
      const { messages: threadMessages, error: threadMessagesError } = await getMessagesForThread(
        dataClient,
        conversationThread.id
      );
      
      if (threadMessagesError) {
        if (isPermissionDenied(threadMessagesError)) {
          return permissionDeniedResponse();
        }
        throw threadMessagesError;
      }
      
      messageRows = threadMessages;
    } else {
      // Fallback: get all messages for backward compatibility
      const { data, error: messageError } = await dataClient
        .from('messages')
        .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id')
        .eq('ask_session_id', askRow.id)
        .order('created_at', { ascending: true });

      if (messageError) {
        if (isPermissionDenied(messageError)) {
          return permissionDeniedResponse();
        }
        throw messageError;
      }
      
      messageRows = data ?? [];
    }

    const messageUserIds = (messageRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    const additionalUserIds = messageUserIds.filter(id => !usersById[id]);

    if (additionalUserIds.length > 0) {
      const { data: extraUsers, error: extraUsersError } = await dataClient
        .from('profiles')
        .select('id, email, full_name, first_name, last_name')
        .in('id', additionalUserIds);

      if (extraUsersError) {
        if (isPermissionDenied(extraUsersError)) {
          return permissionDeniedResponse();
        }
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
      const { data, error } = await dataClient
        .from('projects')
        .select('id, name, system_prompt')
        .eq('id', askRow.project_id)
        .maybeSingle<ProjectRow>();

      if (error) {
        if (isPermissionDenied(error)) {
          return permissionDeniedResponse();
        }
        throw error;
      }

      projectData = data ?? null;
    }

    let challengeData: ChallengeRow | null = null;
    if (askRow.challenge_id) {
      const { data, error } = await dataClient
        .from('challenges')
        .select('id, name, system_prompt')
        .eq('id', askRow.challenge_id)
        .maybeSingle<ChallengeRow>();

      if (error) {
        if (isPermissionDenied(error)) {
          return permissionDeniedResponse();
        }
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

    // Construire le payload JSON des messages (format optimisé, sans redondance)
    const conversationMessagesPayload = messages.map(message => ({
      id: message.id,
      senderType: message.senderType,
      senderName: message.senderName,
      content: message.content,
      timestamp: message.timestamp,
    }));

    // Variables optimisées : suppression des redondances
    // - messages_json remplace message_history + previous_messages + latest_user_message
    // - participants remplace participants_count + participant_name
    // - Suppression de current_timestamp (inutile)
    // - Suppression de challenge_name et project_name (non utilisés dans les prompts)
    const agentVariables: PromptVariables = {
      ask_key: askRow.ask_key,
      ask_question: promptVariables.ask_question || askRow.question,
      ask_description: promptVariables.ask_description || askRow.description || '',
      participants: promptVariables.participants || '',
      messages_json: JSON.stringify(conversationMessagesPayload),
    };

    let agentConfig: AgentConfigResult;
    try {
      console.log('🔍 Loading chat agent configuration...');
      console.log('Agent slug:', DEFAULT_CHAT_AGENT_SLUG);
      console.log('Variables:', agentVariables);

      agentConfig = await getChatAgentConfig(dataClient, agentVariables);

      console.log('✅ Chat agent config loaded successfully');
      console.log('System prompt length:', agentConfig.systemPrompt?.length || 0);
      console.log('User prompt length:', agentConfig.userPrompt?.length || 0);
      console.log('Model config:', agentConfig.modelConfig.provider);
      console.log('Agent object exists:', !!agentConfig.agent);
      console.log('Agent availableVariables:', agentConfig.agent?.availableVariables ?? 'NOT FOUND');
    } catch (error) {
      if (isPermissionDenied(error)) {
        return permissionDeniedResponse();
      }
      console.error('❌ Error getting chat agent config:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : 'Unknown'
      });
      
      return new Response(JSON.stringify({
        type: 'error',
        error: `Configuration de l'agent introuvable: ${error instanceof Error ? error.message : String(error)}. Vérifiez la table ai_agents.`,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const resolvedUserPrompt = agentConfig.userPrompt;

    if (!resolvedUserPrompt || resolvedUserPrompt.trim().length === 0) {
      return new Response(JSON.stringify({
        type: 'error',
        error: 'Le prompt utilisateur de l’agent est vide. Vérifiez la configuration AI.',
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const prompts = {
      system: agentConfig.systemPrompt,
      user: resolvedUserPrompt,
    };

    console.log('Using agent config:', agentConfig.modelConfig.provider);

    // Payload optimisé pour le logging : on garde seulement les variables actives (available_variables)
    // Les prompts sont déjà résolus avec toutes les variables, mais on garde les variables brutes
    // pour référence/debug, en filtrant seulement celles qui sont déclarées comme disponibles
    const availableVariables = agentConfig.agent?.availableVariables ?? [];
    
    const activeVariables: Record<string, string | undefined> = {};
    
    // Si availableVariables est vide, on inclut toutes les variables pour éviter de perdre des données
    // Sinon, on filtre selon availableVariables
    if (availableVariables.length === 0) {
      console.warn('⚠️  No availableVariables found in agent config, including all variables');
      // Si pas de availableVariables défini, on inclut toutes les variables pour le debugging
      Object.assign(activeVariables, agentVariables);
    } else {
      // Ajouter seulement les variables qui sont dans available_variables ET dans agentVariables
      for (const varKey of availableVariables) {
        if (varKey in agentVariables) {
          activeVariables[varKey] = agentVariables[varKey];
        }
      }
      
      // Toujours ajouter ask_key pour référence si présent dans agentVariables
      // (même s'il n'est pas dans available_variables, c'est utile pour le debugging)
      if (agentVariables.ask_key && !('ask_key' in activeVariables)) {
        activeVariables.ask_key = agentVariables.ask_key;
      }
    }
    
    console.log('📊 Variables filtering result:');
    console.log('  - Available variables from agent:', availableVariables);
    console.log('  - Active variables in payload:', Object.keys(activeVariables));

    const agentRequestPayload = {
      agentSlug: CHAT_AGENT_SLUG,
      modelConfigId: agentConfig.modelConfig.id,
      // Prompts résolus (contiennent déjà toutes les infos via substitution de variables)
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      // Variables actives sélectionnées (seulement celles dans available_variables)
      variables: activeVariables,
    } satisfies Record<string, unknown>;

    // Create a log entry for tracking
    let log: AiAgentLog | null = null;
    try {
      log = await createAgentLog(dataClient, {
        agentId: agentConfig.agent?.id || null,
        askSessionId: askRow.id,
        messageId: null,
        interactionType: 'ask.chat.response',
        requestPayload: agentRequestPayload,
      });
    } catch (error) {
      console.error('Unable to create agent log for streaming response:', error);
    }

    console.log('System prompt:', prompts.system);
    console.log('User prompt:', prompts.user);
    console.log('Agent variables:', agentVariables);
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
              await markAgentLogProcessing(dataClient, log.id, { modelConfigId: agentConfig.modelConfig.id });
            } catch (error) {
              console.error('Unable to mark agent log processing:', error);
            }
          }
          
          try {
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

                // Trouver le dernier message utilisateur pour le lier comme parent
                // On récupère les messages depuis la base pour trouver le dernier message utilisateur
                const { data: recentMessages } = await dataClient
                  .from('messages')
                  .select('id, sender_type')
                  .eq('ask_session_id', askRow.id)
                  .order('created_at', { ascending: false })
                  .limit(10);
                
                const lastUserMessage = (recentMessages ?? []).find(msg => msg.sender_type === 'user');
                const parentMessageId = lastUserMessage?.id ?? null;

                const { data: insertedRows, error: insertError } = await dataClient
                  .from('messages')
                  .insert({
                    ask_session_id: askRow.id,
                    content: fullContent.trim(),
                    sender_type: 'ai',
                    message_type: 'text',
                    metadata: aiMetadata,
                    parent_message_id: parentMessageId,
                    conversation_thread_id: conversationThread?.id ?? null,
                  })
                  .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at')
                  .limit(1);

                if (insertError) {
                  if (isPermissionDenied(insertError)) {
                    console.error('Permission denied while storing AI response:', insertError);
                  } else {
                    console.error('Error storing AI response:', insertError);
                  }
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

              // Trigger insight detection to capture KPI insights
              try {
                const respondUrl = new URL(request.url);
                respondUrl.pathname = `/api/ask/${encodeURIComponent(key)}/respond`;
                respondUrl.search = '';

                const detectionHeaders: Record<string, string> = {
                  'Content-Type': 'application/json',
                  ...(request.headers.get('cookie') ? { Cookie: request.headers.get('cookie')! } : {}),
                };

                if (inviteToken) {
                  detectionHeaders['X-Invite-Token'] = inviteToken;
                }

                const detectionResponse = await fetch(respondUrl.toString(), {
                  method: 'POST',
                  headers: detectionHeaders,
                  body: JSON.stringify({
                    detectInsights: true,
                    askSessionId: askRow.id,
                  }),
                  cache: 'no-store',
                });

                if (detectionResponse.ok) {
                  const detectionJson = (await detectionResponse.json()) as InsightDetectionResponse;

                  if (detectionJson.success) {
                    const insights = detectionJson.data?.insights ?? [];

                    const insightsEvent = JSON.stringify({
                      type: 'insights',
                      insights,
                    });
                    controller.enqueue(encoder.encode(`data: ${insightsEvent}\n\n`));
                  } else if (detectionJson.error) {
                    console.warn('Insight detection responded with error:', detectionJson.error);
                  }
                } else {
                  console.error('Insight detection request failed:', detectionResponse.status, detectionResponse.statusText);
                }
              } catch (insightError) {
                console.error('Unable to detect insights:', insightError);
              }

              // Send completion signal
              controller.enqueue(encoder.encode(`data: {"type": "done"}\n\n`));
              
              // Complete the log
              if (log) {
                try {
                  await completeAgentLog(dataClient, log.id, {
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
          } catch (streamError) {
            console.error('Error in model provider stream:', streamError);
            
            // Fail the log
            if (log) {
              try {
                await failAgentLog(dataClient, log.id, parseErrorMessage(streamError));
              } catch (failError) {
                console.error('Unable to mark agent log as failed:', failError);
              }
            }
            
            const errorData = JSON.stringify({
              type: 'error',
              error: parseErrorMessage(streamError)
            });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
            return;
          }
        } catch (error) {
          console.error('Streaming error:', error);
          
          // Fail the log
          if (log) {
            try {
              await failAgentLog(dataClient, log.id, parseErrorMessage(error));
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
