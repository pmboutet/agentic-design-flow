import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { ApiResponse, Ask, AskParticipant, Insight, Message } from '@/types';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { mapInsightRowToInsight } from '@/lib/insights';
import { fetchInsightsForSession } from '@/lib/insightQueries';
import { normaliseMessageMetadata } from '@/lib/messages';
import { getAskSessionByKey, getOrCreateConversationThread, getMessagesForThread, getInsightsForThread, shouldUseSharedThread } from '@/lib/asks';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { executeAgent } from '@/lib/ai/service';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';
import { getConversationPlanWithSteps, type ConversationPlan } from '@/lib/ai/conversation-plan';

interface AskSessionRow {
  id: string;
  ask_key: string;
  name?: string | null;
  question: string;
  description?: string | null;
  system_prompt?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  delivery_mode?: string | null;
  conversation_mode?: string | null;
  is_anonymous?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
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

function permissionDeniedResponse(): NextResponse<ApiResponse> {
  return NextResponse.json<ApiResponse>({
    success: false,
    error: "Accès non autorisé à cette ASK"
  }, { status: 403 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const isDevBypass = process.env.IS_DEV === 'true';

    let adminClient: SupabaseClient | null = null;
    const getAdminClient = async () => {
      if (!adminClient) {
        const { getAdminSupabaseClient } = await import('@/lib/supabaseAdmin');
        adminClient = getAdminSupabaseClient();
      }
      return adminClient;
    };

    let dataClient: SupabaseClient = supabase;
    let profileId: string | null = null;
    let participantId: string | null = null;

    // Check for invite token in headers (allows anonymous participation)
    const inviteToken = request.headers.get('X-Invite-Token');

    if (!isDevBypass) {
      // Try to authenticate via invite token first
      if (inviteToken) {
        console.log(`🔑 GET /api/ask/[key]: Attempting authentication via invite token ${inviteToken.substring(0, 8)}...`);

        // Use admin client to validate token and get participant info
        const admin = await getAdminClient();

        const { data: participant, error: tokenError } = await admin
          .from('ask_participants')
          .select('id, user_id, ask_session_id')
          .eq('invite_token', inviteToken)
          .maybeSingle();

        if (tokenError) {
          console.error('❌ Error validating invite token:', tokenError);
        } else if (participant) {
          // STRICT REQUIREMENT: Every participant MUST have a user_id
          if (!participant.user_id) {
            console.error('❌ GET: Invite token is not linked to a user profile', {
              participantId: participant.id,
              inviteToken: inviteToken.substring(0, 8) + '...'
            });
            return NextResponse.json<ApiResponse>({
              success: false,
              error: "Ce lien d'invitation n'est pas correctement configuré. Contactez l'administrateur pour qu'il regénère votre lien d'accès."
            }, { status: 403 });
          }

          console.log(`✅ Valid invite token for participant ${participant.id}`, {
            hasUserId: !!participant.user_id,
            userId: participant.user_id
          });
          participantId = participant.id;
          profileId = participant.user_id; // REQUIRED - never NULL
          dataClient = admin;
        } else {
          console.warn('⚠️  Invite token not found in database');
        }
      }

      // If no valid token, try regular auth
      if (!inviteToken || !participantId) {
        const { data: userResult, error: userError } = await supabase.auth.getUser();

        if (userError) {
          if (isPermissionDenied(userError as unknown as PostgrestError)) {
            return permissionDeniedResponse();
          }
          throw userError;
        }

        const user = userResult?.user;

        if (!user) {
          return NextResponse.json<ApiResponse>({
            success: false,
            error: "Authentification requise. Veuillez vous connecter ou utiliser un lien d'invitation valide."
          }, { status: 401 });
        }

        // Get profile ID from auth_id (user.id is the auth UUID, we need the profile UUID)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_id', user.id)
          .single();

        if (profileError || !profile) {
          return NextResponse.json<ApiResponse>({
            success: false,
            error: "Profil utilisateur introuvable"
          }, { status: 401 });
        }

        profileId = profile.id;
      }
    }

    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(
      dataClient,
      key,
      '*'
    );

    if (askError) {
      if (isPermissionDenied(askError)) {
        return permissionDeniedResponse();
      }
      throw askError;
    }

    if (!askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour la clé fournie'
      }, { status: 404 });
    }

    if (!isDevBypass && (profileId || participantId)) {
      const isAnonymous = askRow.is_anonymous === true;

      // If authenticated via invite token, verify participant belongs to this ASK
      if (participantId) {
        const admin = await getAdminClient();

        const { data: participantCheck, error: checkError } = await admin
          .from('ask_participants')
          .select('id, ask_session_id')
          .eq('id', participantId)
          .eq('ask_session_id', askRow.id)
          .maybeSingle();

        if (checkError || !participantCheck) {
          console.error('❌ Participant does not belong to this ASK session');
          return permissionDeniedResponse();
        }

        console.log(`✅ Participant ${participantId} verified for ASK ${askRow.id}`);
      } else if (profileId) {
        // Check if user is a participant (regular auth flow)
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
    }

    const askSessionId = askRow.id;

    const { data: participantRows, error: participantError } = await dataClient
      .from('ask_participants')
      .select('*')
      .eq('ask_session_id', askSessionId)
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

    const participants: AskParticipant[] = (participantRows ?? []).map((row, index) => {
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

    const participantSummaries = participants.map(participant => ({
      name: participant.name,
      role: participant.role ?? null,
    }));

    // Get or create conversation thread for this user/ASK
    const askConfig = {
      conversation_mode: askRow.conversation_mode ?? null,
    };

    console.log('🔍 GET /api/ask/[key]: Determining conversation thread:', {
      askSessionId,
      profileId,
      conversationMode: askConfig.conversation_mode,
      isDevBypass,
    });
    
    // In dev bypass mode, use admin client to bypass RLS for thread operations
    const threadClient = isDevBypass ? await getAdminClient() : dataClient;
    
    const { thread: conversationThread, error: threadError } = await getOrCreateConversationThread(
      threadClient,
      askSessionId,
      profileId,
      askConfig
    );

    console.log('🔍 GET /api/ask/[key]: Conversation thread determined:', {
      threadId: conversationThread?.id ?? null,
      profileId,
      isShared: conversationThread?.is_shared ?? null,
    });

    if (threadError) {
      if (isPermissionDenied(threadError)) {
        return permissionDeniedResponse();
      }
      throw threadError;
    }

    // Get messages for the thread (or all messages if no thread yet for backward compatibility)
    let messageRows: MessageRow[] = [];
    
    // Special handling for dev mode when falling back to shared thread in individual mode
    // In this case, we want to show ALL messages (from all threads) to help with debugging
    const isIndividualModeButUsingSharedThread = 
      !shouldUseSharedThread(askConfig) && 
      conversationThread?.is_shared === true &&
      isDevBypass;
    
    if (isIndividualModeButUsingSharedThread) {
      // In dev mode, if we're in individual mode but using shared thread (because profileId is null),
      // fetch ALL messages from all threads to help with debugging
      console.log('⚠️ Dev mode: Individual ASK but using shared thread (profileId is null). Fetching ALL messages from all threads for debugging.');
      const { data, error: messageError } = await dataClient
        .from('messages')
        .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id')
        .eq('ask_session_id', askSessionId)
        .order('created_at', { ascending: true });

      if (messageError) {
        if (isPermissionDenied(messageError)) {
          return permissionDeniedResponse();
        }
        throw messageError;
      }
      
      messageRows = (data ?? []) as MessageRow[];
    } else if (conversationThread) {
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
      
      // Also get messages without conversation_thread_id for backward compatibility
      // This ensures messages created before thread creation are still visible
      const { data: messagesWithoutThread, error: messagesWithoutThreadError } = await dataClient
        .from('messages')
        .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id')
        .eq('ask_session_id', askSessionId)
        .is('conversation_thread_id', null)
        .order('created_at', { ascending: true });

      if (messagesWithoutThreadError && !isPermissionDenied(messagesWithoutThreadError)) {
        console.warn('⚠️ Error fetching messages without thread:', messagesWithoutThreadError);
      }
      
      // Combine thread messages with messages without thread
      const threadMessagesList = (threadMessages ?? []) as MessageRow[];
      const messagesWithoutThreadList = (messagesWithoutThread ?? []) as MessageRow[];
      messageRows = [...threadMessagesList, ...messagesWithoutThreadList].sort((a, b) => {
        const timeA = new Date(a.created_at ?? new Date().toISOString()).getTime();
        const timeB = new Date(b.created_at ?? new Date().toISOString()).getTime();
        return timeA - timeB;
      });
    } else {
      // Fallback: get all messages for backward compatibility
      const { data, error: messageError } = await dataClient
        .from('messages')
        .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id')
        .eq('ask_session_id', askSessionId)
        .order('created_at', { ascending: true });

      if (messageError) {
        if (isPermissionDenied(messageError)) {
          return permissionDeniedResponse();
        }
        throw messageError;
      }
      
      messageRows = (data ?? []) as MessageRow[];
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

    const messages: Message[] = (messageRows ?? []).map((row, index) => {
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
        conversationThreadId: (row as any).conversation_thread_id ?? null,
        content: row.content,
        type: (row.message_type as Message['type']) ?? 'text',
        senderType: (row.sender_type as Message['senderType']) ?? 'user',
        senderId: row.user_id ?? null,
        senderName,
        timestamp: row.created_at ?? new Date().toISOString(),
        metadata: metadata,
      };
    });

    // Get conversation plan if thread exists (do this BEFORE initializing messages)
    let conversationPlan: ConversationPlan | null = null;
    if (conversationThread) {
      conversationPlan = await getConversationPlanWithSteps(dataClient, conversationThread.id);
      if (conversationPlan && conversationPlan.plan_data) {
        console.log('📋 GET /api/ask/[key]: Loaded existing conversation plan with', conversationPlan.plan_data.steps.length, 'steps');
      }
    }

    // Load project/challenge context when needed (plan generation or initial prompt)
    let projectData: ProjectRow | null = null;
    let challengeData: ChallengeRow | null = null;
    const shouldLoadContext = !conversationPlan || messages.length === 0;

    if (shouldLoadContext) {
      if (askRow.project_id) {
        const { data, error } = await dataClient
          .from('projects')
          .select('id, name, system_prompt')
          .eq('id', askRow.project_id)
          .maybeSingle<ProjectRow>();

        if (error) {
          console.error('❌ GET /api/ask/[key]: Failed to fetch project for context:', error);
        } else {
          projectData = data ?? null;
        }
      }

      if (askRow.challenge_id) {
        const { data, error } = await dataClient
          .from('challenges')
          .select('id, name, system_prompt')
          .eq('id', askRow.challenge_id)
          .maybeSingle<ChallengeRow>();

        if (error) {
          console.error('❌ GET /api/ask/[key]: Failed to fetch challenge for context:', error);
        } else {
          challengeData = data ?? null;
        }
      }
    }

    // Ensure a conversation plan exists even when messages already exist (prod backfill)
    if (conversationThread && !conversationPlan) {
      console.log('📋 GET /api/ask/[key]: Generating conversation plan because none exists');
      try {
        const { generateConversationPlan, createConversationPlan } = await import('@/lib/ai/conversation-plan');
        
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

        // Use admin client to bypass RLS for agent fetch + plan insert
        const adminForPlan = await getAdminClient();

        const planData = await generateConversationPlan(
          adminForPlan,
          askRow.id,
          planGenerationVariables
        );

        conversationPlan = await createConversationPlan(
          adminForPlan,
          conversationThread.id,
          planData
        );

        console.log('✅ GET /api/ask/[key]: Conversation plan created with', planData.steps.length, 'steps');
      } catch (planError) {
        console.error('⚠️ GET /api/ask/[key]: Failed to generate conversation plan:', planError);
        // Continue without the plan - it's an enhancement, not a requirement
      }
    }

    // If no messages exist, initiate conversation with agent
    if (messages.length === 0) {
      try {
        console.log('💬 GET /api/ask/[key]: No messages found, initiating conversation with agent');

        const agentVariables = buildConversationAgentVariables({
          ask: askRow,
          project: projectData,
          challenge: challengeData,
          messages,
          participants: participantSummaries,
          conversationPlan,
        });
        
        // Execute agent to get initial response
        const agentResult = await executeAgent({
          supabase: dataClient,
          agentSlug: 'ask-conversation-response',
          askSessionId: askSessionId,
          interactionType: 'ask.chat.response',
          variables: agentVariables,
        });

        if (typeof agentResult.content === 'string' && agentResult.content.trim().length > 0) {
          const aiResponse = agentResult.content.trim();
          
          // Insert the initial AI message
          const { data: insertedRows, error: insertError } = await dataClient
            .from('messages')
            .insert({
              ask_session_id: askSessionId,
              content: aiResponse,
              sender_type: 'ai',
              message_type: 'text',
              metadata: { senderName: 'Agent' },
              conversation_thread_id: conversationThread?.id ?? null,
            })
            .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id')
            .limit(1);

          if (!insertError && insertedRows && insertedRows.length > 0) {
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
            messages.push(initialMessage);
            console.log('✅ GET /api/ask/[key]: Initial conversation message created:', initialMessage.id);
          } else {
            console.error('❌ GET /api/ask/[key]: Failed to insert initial message:', insertError);
          }
        }
      } catch (error) {
        // Log error but don't fail the request - user can still interact
        console.error('⚠️ GET /api/ask/[key]: Failed to initiate conversation:', error);
      }
    }

    // Get insights for the session
    // In individual mode, we should ideally filter by thread, but to ensure all insights are visible
    // (especially when insights are created in individual threads but viewed from shared thread),
    // we fetch all insights for the session and filter client-side if needed
    let insightRows;
    try {
      // Always fetch all insights for the session to ensure visibility across threads
      // This is important because insights might be created in individual threads
      // but need to be visible when viewing from a shared thread or different user context
      insightRows = await fetchInsightsForSession(dataClient, askSessionId);
      
      console.log('📊 GET /api/ask/[key]: Fetched insights for session:', {
        totalInsights: insightRows.length,
        threadId: conversationThread?.id ?? null,
        isShared: conversationThread?.is_shared ?? null,
        insightsByThread: insightRows.reduce((acc, insight) => {
          const threadId = (insight as any).conversation_thread_id ?? 'no-thread';
          acc[threadId] = (acc[threadId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      });
      
      // If we have a specific thread and it's not shared, we could filter by thread
      // But for now, we show all insights to ensure visibility
      // TODO: Consider adding a query parameter to filter by thread if needed
    } catch (error) {
      if (isPermissionDenied((error as PostgrestError) ?? null)) {
        return permissionDeniedResponse();
      }
      throw error;
    }

    const insights: Insight[] = insightRows.map((row) => {
      const insight = mapInsightRowToInsight(row);
      return {
        ...insight,
        conversationThreadId: conversationThread?.id ?? null,
      };
    });

    console.log('📊 GET /api/ask/[key]: Returning insights:', {
      insightCount: insights.length,
      insightIds: insights.map(i => i.id),
      conversationThreadId: conversationThread?.id ?? null,
    });

    const endDate = askRow.end_date ?? new Date().toISOString();
    const createdAt = askRow.created_at ?? new Date().toISOString();
    const updatedAt = askRow.updated_at ?? createdAt;

    const ask: Ask = {
      id: askRow.id,
      key: askRow.ask_key,
      name: askRow.name ?? null,
      question: askRow.question,
      description: askRow.description ?? null,
      status: askRow.status ?? null,
      isActive: (askRow.status ?? '').toLowerCase() === 'active',
      startDate: askRow.start_date ?? null,
      endDate,
      createdAt,
      updatedAt,
      deliveryMode: (askRow.delivery_mode as Ask['deliveryMode']) ?? 'digital',
      conversationMode: (askRow.conversation_mode as Ask['conversationMode']) ?? 'collaborative',
      participants,
      askSessionId: askSessionId,
    };

    if (ask.endDate) {
      const now = Date.now();
      const end = new Date(ask.endDate).getTime();
      if (!Number.isNaN(end) && end < now) {
        ask.isActive = false;
      }
    }

    if (ask.startDate) {
      const now = Date.now();
      const start = new Date(ask.startDate).getTime();
      if (!Number.isNaN(start) && start > now) {
        ask.isActive = false;
      }
    }

    return NextResponse.json<ApiResponse<{
      ask: Ask;
      messages: Message[];
      insights: Insight[];
      challenges: any[];
      conversationPlan?: ConversationPlan | null;
    }>>({
      success: true,
      data: {
        ask,
        messages,
        insights,
        challenges: [],
        conversationPlan,
      }
    });
  } catch (error) {
    console.error('Error retrieving ASK from database:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    const body = await request.json();

    if (!body?.content) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Message content is required'
      }, { status: 400 });
    }

    const isDevBypass = process.env.IS_DEV === 'true';
    
    // In dev mode, createServerSupabaseClient uses service role which has no user session
    // We need a normal client to get the user session for authentication
    let supabase: SupabaseClient;
    if (isDevBypass) {
      // Create a normal client to get user session even in dev mode
      const { createServerClient } = await import('@supabase/ssr');
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value;
            },
            set() {}, // No-op in route handlers
            remove() {}, // No-op in route handlers
          },
        }
      ) as unknown as SupabaseClient;
    } else {
      supabase = await createServerSupabaseClient();
    }

    let adminClient: SupabaseClient | null = null;
    const getAdminClient = async () => {
      if (!adminClient) {
        const { getAdminSupabaseClient } = await import('@/lib/supabaseAdmin');
        adminClient = getAdminSupabaseClient();
      }
      return adminClient;
    };

    let dataClient: SupabaseClient = supabase;

    // Check for invite token in headers (allows anonymous participation)
    const inviteToken = request.headers.get('X-Invite-Token');
    console.log('🔍 POST /api/ask/[key]: Invite token check', {
      hasInviteToken: !!inviteToken,
      tokenPrefix: inviteToken ? inviteToken.substring(0, 8) + '...' : null,
      isDevBypass
    });

    let profileId: string | null = null;
    let participantId: string | null = null;

    // Try to authenticate via invite token first (dev mode should support invite links too)
    if (inviteToken) {
      console.log(`🔑 POST /api/ask/[key]: Attempting authentication via invite token ${inviteToken.substring(0, 8)}...`);

      // Use admin client to validate token and get participant info
      const admin = await getAdminClient();

      const { data: participant, error: tokenError } = await admin
        .from('ask_participants')
        .select('id, user_id, ask_session_id')
        .eq('invite_token', inviteToken)
        .maybeSingle();

      if (tokenError) {
        console.error('❌ Error validating invite token:', tokenError);
      } else if (participant) {
        // STRICT REQUIREMENT: Every participant MUST have a user_id
        if (!participant.user_id) {
          console.error('❌ Invite token is not linked to a user profile', {
            participantId: participant.id,
            inviteToken: inviteToken.substring(0, 8) + '...'
          });
          return NextResponse.json<ApiResponse>({
            success: false,
            error: "Ce lien d'invitation n'est pas correctement configuré. Contactez l'administrateur pour qu'il regénère votre lien d'accès."
          }, { status: 403 });
        }

        console.log(`✅ Valid invite token for participant ${participant.id}`, {
          hasUserId: !!participant.user_id,
          userId: participant.user_id
        });
        participantId = participant.id;
        profileId = participant.user_id; // REQUIRED - never NULL
        dataClient = admin;
      } else {
        console.warn('⚠️  Invite token not found in database');
      }
    }

    if (!isDevBypass) {
      // If no valid token, try regular auth
      if (!participantId) {
        console.log('🔐 POST /api/ask/[key]: No valid invite token, trying regular auth...');
        const { data: userResult, error: userError } = await supabase.auth.getUser();

        if (userError) {
          console.error('❌ POST /api/ask/[key]: Auth error:', userError);
          if (isPermissionDenied(userError as unknown as PostgrestError)) {
            return permissionDeniedResponse();
          }
          throw userError;
        }

        const user = userResult?.user;

        if (!user) {
          console.warn('⚠️ POST /api/ask/[key]: No authenticated user found and no valid invite token');
          return NextResponse.json<ApiResponse>({
            success: false,
            error: "Authentification requise. Veuillez vous connecter ou utiliser un lien d'invitation valide."
          }, { status: 403 });
        }
        
        console.log('✅ POST /api/ask/[key]: Authenticated user found:', user.id);

        // Get profile ID from auth_id (user.id is the auth UUID, we need the profile UUID)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_id', user.id)
          .single();

        if (profileError || !profile) {
          console.error('❌ POST /api/ask/[key]: Profile not found for user:', user.id);
          return NextResponse.json<ApiResponse>({
            success: false,
            error: "Profil utilisateur introuvable"
          }, { status: 401 });
        }

        profileId = profile.id;
        console.log('✅ POST /api/ask/[key]: Profile ID found:', profileId);
      }
    } else {
      // Dev bypass mode - always use admin client to bypass RLS
      console.log('🔓 POST /api/ask/[key]: Dev bypass mode - no auth required');
      const admin = await getAdminClient();
      dataClient = admin;
      console.log('✅ POST /api/ask/[key]: Using admin client in dev bypass mode');
    }

    // Final check: we MUST have a profileId (no anonymous participants allowed)
    // We need EITHER:
    // - profileId from authenticated user OR from valid invite token
    // - dev bypass mode
    if (!isDevBypass && !profileId) {
      console.error('❌ POST /api/ask/[key]: No valid user profile (profileId required)', {
        hasParticipantId: !!participantId,
        hasInviteToken: !!inviteToken
      });
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Authentification requise. Veuillez vous connecter avec un compte valide ou utiliser un lien d'invitation correctement configuré."
      }, { status: 403 });
    }

    console.log('✅ POST /api/ask/[key]: Authentication validated', {
      hasProfileId: !!profileId,
      hasParticipantId: !!participantId,
      isDevBypass,
      authMethod: participantId ? 'invite_token' : 'regular_auth'
    });

    const { row: askRow, error: askError } = await getAskSessionByKey<Pick<AskSessionRow, 'id' | 'ask_key' | 'is_anonymous' | 'conversation_mode'>>(
      dataClient,
      key,
      'id, ask_key, is_anonymous, conversation_mode'
    );

    if (askError) {
      if (isPermissionDenied(askError)) {
        return permissionDeniedResponse();
      }
      throw askError;
    }

    if (!askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour la clé fournie'
      }, { status: 404 });
    }

    console.log('🔍 POST /api/ask/[key]: Retrieved ASK', {
      askKey: key,
      askRowId: askRow.id,
      askRowKey: askRow.ask_key,
      participantId,
      profileId
    });

    // En mode dev, si profileId est null, on essaie de récupérer ou créer un profil par défaut
    let finalProfileId = profileId;
    if (isDevBypass && !finalProfileId) {
      // En mode dev, chercher un profil admin par défaut
      const admin = await getAdminClient();
      const { data: devProfile } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (devProfile) {
        finalProfileId = devProfile.id;
        console.log('✅ POST /api/ask/[key]: Using default admin profile in dev mode:', finalProfileId);
      } else {
        // If no admin profile found, try to get any active profile
        const { data: anyProfile } = await admin
          .from('profiles')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        
        if (anyProfile) {
          finalProfileId = anyProfile.id;
          console.log('✅ POST /api/ask/[key]: Using first active profile in dev mode:', finalProfileId);
        } else {
          console.error('❌ POST /api/ask/[key]: No active profiles found in dev mode. Cannot insert message without user_id.');
          return NextResponse.json<ApiResponse>({
            success: false,
            error: "Aucun profil utilisateur actif trouvé. Veuillez créer un profil utilisateur dans la base de données."
          }, { status: 500 });
        }
      }
    }

    // Final validation: we MUST have a profileId to insert a message
    if (!finalProfileId) {
      console.error('❌ POST /api/ask/[key]: Cannot insert message without user_id', {
        isDevBypass,
        hasProfileId: !!profileId,
        hasParticipantId: !!participantId,
        hasInviteToken: !!inviteToken
      });
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Impossible d'insérer un message sans identifiant utilisateur. Veuillez vous connecter ou utiliser un lien d'invitation valide."
      }, { status: 403 });
    }

    // Get or create conversation thread for this user/ASK
    const askConfig = {
      conversation_mode: askRow.conversation_mode ?? null,
    };

    console.log('🔍 POST /api/ask/[key]: Creating/getting conversation thread', {
      askSessionId: askRow.id,
      profileId: finalProfileId,
      conversationMode: askConfig.conversation_mode,
      isDevBypass
    });
    
    // In dev bypass mode, use admin client to bypass RLS for thread operations
    const threadClient = isDevBypass ? await getAdminClient() : dataClient;
    
    
    const { thread: conversationThread, error: threadError } = await getOrCreateConversationThread(
      threadClient,
      askRow.id,
      finalProfileId,
      askConfig
    );

    if (threadError) {
      console.error('❌ POST /api/ask/[key]: Thread creation error:', threadError);
      if (isPermissionDenied(threadError)) {
        console.error('❌ POST /api/ask/[key]: Thread creation permission denied');
        // In dev bypass mode, allow continuing without a thread
        if (isDevBypass) {
          console.warn('⚠️ POST /api/ask/[key]: Dev bypass mode - continuing without conversation thread');
        } else {
          return permissionDeniedResponse();
        }
      } else {
        // For non-permission errors, still throw in non-dev mode
        if (!isDevBypass) {
          throw threadError;
        } else {
          console.warn('⚠️ POST /api/ask/[key]: Dev bypass mode - continuing without conversation thread after error');
        }
      }
    } else {
      console.log('✅ POST /api/ask/[key]: Conversation thread ready', {
        threadId: conversationThread?.id ?? null,
        hasThread: !!conversationThread
      });
    }

    if (!isDevBypass && (profileId || participantId)) {
      const isAnonymous = askRow.is_anonymous === true;

      // If authenticated via invite token, verify participant belongs to this ASK
      if (participantId) {
        const admin = await getAdminClient();

        // First, get the participant's ask_session_id to debug
        const { data: participantData, error: participantFetchError } = await admin
          .from('ask_participants')
          .select('id, ask_session_id')
          .eq('id', participantId)
          .maybeSingle();

        if (participantFetchError) {
          console.error('❌ POST: Error fetching participant data:', participantFetchError);
          return permissionDeniedResponse();
        }

        if (!participantData) {
          console.error('❌ POST: Participant not found:', participantId);
          return permissionDeniedResponse();
        }

        console.log('🔍 POST: Participant verification:', {
          participantId,
          participantAskSessionId: participantData.ask_session_id,
          askRowId: askRow.id,
          askKey: askRow.ask_key,
          match: participantData.ask_session_id === askRow.id
        });

        if (participantData.ask_session_id !== askRow.id) {
          console.error('❌ POST: Participant does not belong to this ASK session', {
            participantId,
            participantAskSessionId: participantData.ask_session_id,
            askRowId: askRow.id,
            askKey: askRow.ask_key
          });
          return permissionDeniedResponse();
        }

        console.log(`✅ POST: Participant ${participantId} verified for ASK ${askRow.id}`);
      } else if (profileId) {
        // Check if user is a participant (regular auth flow)
        const { data: membership, error: membershipError } = await supabase
          .from('ask_participants')
          .select('id, user_id')
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

        // Store the membership ID for later use
        if (membership) {
          participantId = membership.id;
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
    }

    // Check if profile is quarantined before allowing message insertion
    if (finalProfileId) {
      const { isProfileQuarantined } = await import('@/lib/security/quarantine');
      const isQuarantined = await isProfileQuarantined(dataClient, finalProfileId);
      
      if (isQuarantined) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Votre compte a été mis en quarantaine et ne peut plus envoyer de messages. Contactez un administrateur pour plus d\'informations.'
        }, { status: 403 });
      }
    }

    const timestamp = body.timestamp ?? new Date().toISOString();
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

    if (body.senderName && typeof body.senderName === 'string' && body.senderName.trim().length > 0) {
      metadata.senderName = body.senderName;
    }

    const senderType: Message['senderType'] = 'user';

    // Récupérer parent_message_id si fourni
    const parentMessageId = typeof body.parentMessageId === 'string' && body.parentMessageId.trim().length > 0
      ? body.parentMessageId
      : typeof body.parent_message_id === 'string' && body.parent_message_id.trim().length > 0
      ? body.parent_message_id
      : null;

    const insertPayload = {
      ask_session_id: askRow.id,
      content: body.content,
      message_type: body.type ?? 'text',
      sender_type: senderType,
      metadata,
      created_at: timestamp,
      user_id: finalProfileId, // REQUIRED - never NULL (enforced by validation above)
      // Note: participant_id column does not exist in messages table
      // The user_id already identifies the participant via their profile
      parent_message_id: parentMessageId,
      conversation_thread_id: conversationThread?.id ?? null,
    };

    console.log('🔍 POST /api/ask/[key]: Inserting message', {
      askSessionId: askRow.id,
      userId: finalProfileId,
      hasThreadId: !!conversationThread?.id,
      isDevBypass,
      payloadKeys: Object.keys(insertPayload)
    });

    const { data: insertedRows, error: insertError } = await dataClient
      .from('messages')
      .insert(insertPayload)
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, parent_message_id')
      .limit(1);

    if (insertError) {
      console.error('❌ POST /api/ask/[key]: Message insert error:', {
        error: insertError,
        code: (insertError as any)?.code,
        message: (insertError as any)?.message,
        details: (insertError as any)?.details,
        hint: (insertError as any)?.hint,
        isPermissionDenied: isPermissionDenied(insertError)
      });
      if (isPermissionDenied(insertError)) {
        console.error('❌ POST /api/ask/[key]: Message insert permission denied');
        return permissionDeniedResponse();
      }
      throw insertError;
    }

    console.log('✅ POST /api/ask/[key]: Message inserted successfully', {
      messageId: insertedRows?.[0]?.id
    });

    const inserted = insertedRows?.[0] as MessageRow | undefined;

    if (!inserted) {
      throw new Error('Unable to insert message');
    }

    const message: Message = {
      id: inserted.id,
      askKey: askRow.ask_key,
      askSessionId: inserted.ask_session_id,
      content: inserted.content,
      type: (inserted.message_type as Message['type']) ?? 'text',
      senderType: senderType,
      senderId: inserted.user_id ?? null,
      senderName: typeof metadata.senderName === 'string' ? metadata.senderName : body.senderName ?? null,
      timestamp: inserted.created_at ?? timestamp,
      metadata: normaliseMessageMetadata(inserted.metadata),
    };

    return NextResponse.json<ApiResponse<{ message: Message }>>({
      success: true,
      data: { message },
      message: 'Message saved successfully'
    });
  } catch (error) {
    console.error('Error saving message to database:', error);
    const errorMessage = parseErrorMessage(error);
    console.error('Error details:', {
      message: errorMessage,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json<ApiResponse>({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}
