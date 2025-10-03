import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, Ask, AskParticipant, Insight, Message } from '@/types';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { mapInsightRowToInsight, type InsightRow } from '@/lib/insights';
import { normaliseMessageMetadata } from '@/lib/messages';
import { getAskSessionByKey } from '@/lib/asks';

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

export async function GET(
  _request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const { key } = params;

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    const supabase = getAdminSupabaseClient();

    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(
      supabase,
      key,
      '*'
    );

    if (askError) {
      throw askError;
    }

    if (!askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour la clé fournie'
      }, { status: 404 });
    }

    const askSessionId = askRow.id;

    const { data: participantRows, error: participantError } = await supabase
      .from('ask_participants')
      .select('*')
      .eq('ask_session_id', askSessionId)
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

    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at')
      .eq('ask_session_id', askSessionId)
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
        content: row.content,
        type: (row.message_type as Message['type']) ?? 'text',
        senderType: (row.sender_type as Message['senderType']) ?? 'user',
        senderId: row.user_id ?? null,
        senderName,
        timestamp: row.created_at ?? new Date().toISOString(),
        metadata: metadata,
      };
    });

    // Try to select with ask_id first, fallback to without it if column doesn't exist
    let { data: insightRows, error: insightError } = await supabase
      .from('insights')
      .select('id, ask_session_id, ask_id, challenge_id, content, summary, type, category, status, priority, created_at, updated_at, related_challenge_ids, kpis, source_message_id, insight_authors (id, user_id, display_name)')
      .eq('ask_session_id', askSessionId)
      .order('created_at', { ascending: true });

    // If ask_id column doesn't exist, retry without it
    if (insightError && insightError.message.includes('column insights.ask_id does not exist')) {
      const fallbackResult = await supabase
        .from('insights')
        .select('id, ask_session_id, challenge_id, content, summary, type, category, status, priority, created_at, updated_at, related_challenge_ids, kpis, source_message_id, insight_authors (id, user_id, display_name)')
        .eq('ask_session_id', askSessionId)
        .order('created_at', { ascending: true });

      // Normalise legacy results without ask_id
      insightRows = fallbackResult.data?.map((row) => ({ ...row, ask_id: null })) ?? null;
      insightError = fallbackResult.error;
    }

    if (insightError) {
      throw insightError;
    }

    const insights: Insight[] = ((insightRows ?? []) as InsightRow[]).map(mapInsightRowToInsight);

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
  { params }: { params: { key: string } }
) {
  try {
    const { key } = params;

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

    const supabase = getAdminSupabaseClient();

    const { row: askRow, error: askError } = await getAskSessionByKey<Pick<AskSessionRow, 'id' | 'ask_key'>>(
      supabase,
      key,
      'id, ask_key'
    );

    if (askError) {
      throw askError;
    }

    if (!askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour la clé fournie'
      }, { status: 404 });
    }

    const timestamp = body.timestamp ?? new Date().toISOString();
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

    if (body.senderName && typeof body.senderName === 'string' && body.senderName.trim().length > 0) {
      metadata.senderName = body.senderName;
    }

    const insertPayload = {
      ask_session_id: askRow.id,
      content: body.content,
      message_type: body.type ?? 'text',
      sender_type: body.senderType ?? 'user',
      metadata,
      created_at: timestamp,
      user_id: body.userId ?? null,
    };

    const { data: insertedRows, error: insertError } = await supabase
      .from('messages')
      .insert(insertPayload)
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at')
      .limit(1);

    if (insertError) {
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
      senderType: (inserted.sender_type as Message['senderType']) ?? 'user',
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
