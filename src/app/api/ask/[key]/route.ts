import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { ApiResponse, Ask, AskParticipant, Insight, Message } from '@/types';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { mapInsightRowToInsight } from '@/lib/insights';
import { fetchInsightsForSession } from '@/lib/insightQueries';
import { normaliseMessageMetadata } from '@/lib/messages';
import { getAskSessionByKey, getOrCreateConversationThread, getMessagesForThread, getInsightsForThread, shouldUseSharedThread } from '@/lib/asks';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

interface AskSessionRow {
  id: string;
  ask_key: string;
  name?: string | null;
  question: string;
  description?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  delivery_mode?: string | null;
  audience_scope?: string | null;
  response_mode?: string | null;
  is_anonymous?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
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
          if (!participant.user_id) {
            console.error('❌ Invite token is not linked to a user profile', { participantId: participant.id });
            return NextResponse.json<ApiResponse>({
              success: false,
              error: "Ce lien d'invitation n'est associé à aucun profil utilisateur. Contactez votre administrateur."
            }, { status: 403 });
          }
          console.log(`✅ Valid invite token for participant ${participant.id}`);
          participantId = participant.id;
          profileId = participant.user_id;
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

    // Get or create conversation thread for this user/ASK
    const askConfig = {
      audience_scope: askRow.audience_scope ?? null,
      response_mode: askRow.response_mode ?? null,
    };
    
    const { thread: conversationThread, error: threadError } = await getOrCreateConversationThread(
      dataClient,
      askSessionId,
      profileId,
      askConfig
    );

    if (threadError) {
      if (isPermissionDenied(threadError)) {
        return permissionDeniedResponse();
      }
      throw threadError;
    }

    // Get messages for the thread (or all messages if no thread yet for backward compatibility)
    let messageRows: MessageRow[] = [];
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
      
      messageRows = threadMessages as MessageRow[];
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

    // Get insights for the thread (or all insights if no thread yet for backward compatibility)
    let insightRows;
    try {
      if (conversationThread) {
        const { insights: threadInsights, error: threadInsightsError } = await getInsightsForThread(
          dataClient,
          conversationThread.id
        );
        
        if (threadInsightsError) {
          if (isPermissionDenied(threadInsightsError)) {
            return permissionDeniedResponse();
          }
          throw threadInsightsError;
        }
        
        // Transform to InsightRow format (simplified - may need adjustment based on actual structure)
        insightRows = threadInsights.map((insight: any) => ({
          id: insight.id,
          ask_session_id: insight.ask_session_id,
          ask_id: insight.ask_session_id,
          user_id: insight.user_id,
          challenge_id: insight.challenge_id,
          content: insight.content,
          summary: insight.summary,
          insight_type_id: null,
          type: insight.insight_type,
          category: insight.category,
          priority: insight.priority,
          status: insight.status,
          source_message_id: insight.source_message_id,
          ai_generated: insight.ai_generated,
          created_at: insight.created_at,
          updated_at: insight.updated_at,
          related_challenge_ids: [],
          insight_authors: [],
          kpis: [],
        }));
      } else {
        // Fallback: get all insights for backward compatibility
        insightRows = await fetchInsightsForSession(dataClient, askSessionId);
      }
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
      audienceScope: (askRow.audience_scope as Ask['audienceScope']) ?? (participants.length > 1 ? 'group' : 'individual'),
      responseMode: (askRow.response_mode as Ask['responseMode']) ?? (participants.length > 1 ? 'simultaneous' : 'collective'),
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
    }>>({
      success: true,
      data: {
        ask,
        messages,
        insights,
        challenges: [],
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

    // Check for invite token in headers (allows anonymous participation)
    const inviteToken = request.headers.get('X-Invite-Token');

    let profileId: string | null = null;
    let participantId: string | null = null;

    if (!isDevBypass) {
      // Try to authenticate via invite token first
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
          if (!participant.user_id) {
            console.error('❌ Invite token is not linked to a user profile', { participantId: participant.id });
            return NextResponse.json<ApiResponse>({
              success: false,
              error: "Ce lien d'invitation n'est associé à aucun profil utilisateur. Contactez votre administrateur."
            }, { status: 403 });
          }
          console.log(`✅ Valid invite token for participant ${participant.id}`);
          participantId = participant.id;
          profileId = participant.user_id;
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

    const { row: askRow, error: askError } = await getAskSessionByKey<Pick<AskSessionRow, 'id' | 'ask_key' | 'is_anonymous' | 'audience_scope' | 'response_mode'>>(
      dataClient,
      key,
      'id, ask_key, is_anonymous, audience_scope, response_mode'
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

    // En mode dev, si profileId est null, on essaie de récupérer ou créer un profil par défaut
    let finalProfileId = profileId;
    if (isDevBypass && !finalProfileId) {
      // En mode dev, chercher un profil admin par défaut
      const { data: devProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (devProfile) {
        finalProfileId = devProfile.id;
      }
    }

    // Get or create conversation thread for this user/ASK
    const askConfig = {
      audience_scope: askRow.audience_scope ?? null,
      response_mode: askRow.response_mode ?? null,
    };
    
    const { thread: conversationThread, error: threadError } = await getOrCreateConversationThread(
      dataClient,
      askRow.id,
      finalProfileId,
      askConfig
    );

    if (threadError) {
      if (isPermissionDenied(threadError)) {
        return permissionDeniedResponse();
      }
      throw threadError;
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
      user_id: finalProfileId,
      parent_message_id: parentMessageId,
      conversation_thread_id: conversationThread?.id ?? null,
    };

    const { data: insertedRows, error: insertError } = await dataClient
      .from('messages')
      .insert(insertPayload)
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, parent_message_id')
      .limit(1);

    if (insertError) {
      if (isPermissionDenied(insertError)) {
        return permissionDeniedResponse();
      }
      throw insertError;
    }

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
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
