import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, Message } from '@/types';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';

interface AskSessionRow {
  id: string;
  ask_key: string;
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

function normaliseMessageMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    console.warn('Unable to parse message metadata', error);
    return undefined;
  }
}

export async function POST(
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

    const webhookUrl = process.env.EXTERNAL_RESPONSE_WEBHOOK;

    if (!webhookUrl) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'External webhook not configured'
      }, { status: 500 });
    }

    const supabase = getAdminSupabaseClient();

    const { data: askRow, error: askError } = await supabase
      .from<AskSessionRow>('ask_sessions')
      .select('id, ask_key')
      .eq('ask_key', key)
      .maybeSingle();

    if (askError) {
      throw askError;
    }

    if (!askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour la clé fournie'
      }, { status: 404 });
    }

    const { data: messageRows, error: messageError } = await supabase
      .from<MessageRow>('messages')
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at')
      .eq('ask_session_id', askRow.id)
      .order('created_at', { ascending: true });

    if (messageError) {
      throw messageError;
    }

    const historyPayload = (messageRows ?? []).map((row) => ({
      id: row.id,
      ask_session_id: row.ask_session_id,
      user_id: row.user_id ?? null,
      sender_type: row.sender_type ?? 'user',
      content: row.content,
      message_type: row.message_type ?? 'text',
      metadata: normaliseMessageMetadata(row.metadata) ?? undefined,
      created_at: row.created_at ?? new Date().toISOString(),
    }));

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'agentic-design-flow',
        'X-Request-Type': 'user-message',
      },
      body: JSON.stringify({
        askKey: key,
        action: 'user_message',
        messages: historyPayload,
      }),
    });

    if (!webhookResponse.ok) {
      throw new Error(`External webhook responded with status ${webhookResponse.status}`);
    }

    const webhookData = await webhookResponse.json();

    if (!webhookData || typeof webhookData.output_agent !== 'string') {
      throw new Error('Webhook response does not contain output_agent');
    }

    const aiMetadata = { senderName: 'Agent' } satisfies Record<string, unknown>;

    const { data: insertedRows, error: insertError } = await supabase
      .from('messages')
      .insert({
        ask_session_id: askRow.id,
        content: webhookData.output_agent,
        sender_type: 'ai',
        message_type: 'text',
        metadata: aiMetadata,
      })
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at')
      .limit(1);

    if (insertError) {
      throw insertError;
    }

    const inserted = insertedRows?.[0] as MessageRow | undefined;

    if (!inserted) {
      throw new Error('Unable to store AI response');
    }

    const message: Message = {
      id: inserted.id,
      askKey: askRow.ask_key,
      askSessionId: inserted.ask_session_id,
      content: inserted.content,
      type: (inserted.message_type as Message['type']) ?? 'text',
      senderType: 'ai',
      senderId: inserted.user_id ?? null,
      senderName: 'Agent',
      timestamp: inserted.created_at ?? new Date().toISOString(),
      metadata: normaliseMessageMetadata(inserted.metadata),
    };

    return NextResponse.json<ApiResponse<{ message: Message }>>({
      success: true,
      data: { message },
    });
  } catch (error) {
    console.error('Error triggering AI response:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
