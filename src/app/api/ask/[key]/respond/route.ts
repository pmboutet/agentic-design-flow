import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, Insight, Message } from '@/types';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { INSIGHT_TYPES, mapInsightRowToInsight, type InsightRow } from '@/lib/insights';
import { normaliseMessageMetadata } from '@/lib/messages';

type AdminSupabaseClient = ReturnType<typeof getAdminSupabaseClient>;

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

type IncomingInsight = {
  id?: string;
  askSessionId?: string;
  content?: string;
  summary?: string;
  type?: string;
  category?: string;
  status?: string;
  priority?: string;
  challengeId?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  relatedChallengeIds?: string[];
  kpis?: Array<Record<string, unknown>>;
  sourceMessageId?: string | null;
  authors?: unknown;
};

type NormalisedIncomingAuthor = {
  userId: string | null;
  name: string | null;
};

type NormalisedIncomingInsight = IncomingInsight & {
  authors: NormalisedIncomingAuthor[];
  authorsProvided: boolean;
};

async function replaceInsightAuthors(
  supabase: AdminSupabaseClient,
  insightId: string,
  authors: NormalisedIncomingAuthor[],
) {
  const { error: deleteError } = await supabase
    .from('insight_authors')
    .delete()
    .eq('insight_id', insightId);

  if (deleteError) {
    throw deleteError;
  }

  const rows = authors
    .map((author) => {
      const name = typeof author.name === 'string' && author.name ? author.name : null;
      const userId = typeof author.userId === 'string' && author.userId ? author.userId : null;

      if (!name && !userId) {
        return null;
      }

      return {
        insight_id: insightId,
        user_id: userId,
        display_name: name,
      } satisfies Record<string, unknown>;
    })
    .filter((value): value is Record<string, unknown> => value !== null);

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from('insight_authors')
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

async function fetchInsightById(
  supabase: AdminSupabaseClient,
  insightId: string,
): Promise<InsightRow | null> {
  const { data, error } = await supabase
    .from('insights')
    .select('id, ask_session_id, challenge_id, content, summary, type, category, status, priority, created_at, updated_at, related_challenge_ids, kpis, source_message_id, insight_authors (id, user_id, display_name)')
    .eq('id', insightId)
    .maybeSingle<InsightRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

function normaliseIncomingKpis(kpis: unknown, fallback: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (!Array.isArray(kpis)) {
    return fallback;
  }

  return kpis.map((kpi, index) => {
    const raw = typeof kpi === 'object' && kpi !== null ? (kpi as Record<string, unknown>) : {};
    const providedId = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : undefined;

    return {
      id: providedId ?? randomUUID(),
      label: typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label : `KPI ${index + 1}`,
      value: raw.value ?? null,
      description: typeof raw.description === 'string' && raw.description.trim().length > 0 ? raw.description : null,
    } satisfies Record<string, unknown>;
  });
}

function parseIncomingAuthor(value: unknown): NormalisedIncomingAuthor | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  const getString = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const raw = record[key];
      if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw;
      }
    }
    return undefined;
  };

  const userId = getString('userId', 'user_id', 'authorId', 'author_id');
  const name = getString('name', 'authorName', 'author_name', 'displayName', 'display_name');

  if (!userId && !name) {
    return null;
  }

  return {
    userId: userId ?? null,
    name: name ?? null,
  };
}

function normaliseIncomingInsights(value: unknown): { types: Insight['type'][]; items: NormalisedIncomingInsight[] } {
  const envelope = (typeof value === 'object' && value !== null) ? (value as Record<string, unknown>) : {};
  const rawTypes = Array.isArray(envelope.types) ? envelope.types : [];
  const types = rawTypes
    .map(type => (typeof type === 'string' ? type.trim() : ''))
    .filter((type): type is Insight['type'] => INSIGHT_TYPES.includes(type as Insight['type']));

  const rawItems = Array.isArray(envelope.items) ? envelope.items : [];

  const items: NormalisedIncomingInsight[] = rawItems.map((item) => {
    const record = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};

    const getString = (key: string): string | undefined => {
      const value = record[key];
      return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
    };

    const relatedChallengeIds = (() => {
      const candidate = record.relatedChallengeIds ?? record.related_challenge_ids;
      if (!Array.isArray(candidate)) {
        return undefined;
      }
      return candidate.map((id) => String(id));
    })();

    const kpis = record.kpis;

    const fallbackAuthorId = getString('authorId') ?? getString('author_id');
    const fallbackAuthorName = getString('authorName') ?? getString('author_name');

    const rawAuthors = record.authors;
    let authorsProvided = false;
    const authors: NormalisedIncomingAuthor[] = [];

    if (Array.isArray(rawAuthors)) {
      authorsProvided = true;
      for (const entry of rawAuthors) {
        const parsed = parseIncomingAuthor(entry);
        if (parsed) {
          authors.push(parsed);
        }
      }
    } else if (rawAuthors) {
      const parsed = parseIncomingAuthor(rawAuthors);
      if (parsed) {
        authorsProvided = true;
        authors.push(parsed);
      }
    }

    if (!authorsProvided && (fallbackAuthorId || fallbackAuthorName)) {
      authorsProvided = true;
      authors.push({
        userId: fallbackAuthorId ?? null,
        name: fallbackAuthorName ?? null,
      });
    }

    const primaryAuthor = authors[0] ?? null;

    return {
      id: getString('id'),
      askSessionId: getString('askSessionId') ?? getString('ask_session_id'),
      content: getString('content'),
      summary: getString('summary'),
      type: getString('type'),
      category: getString('category'),
      status: getString('status'),
      priority: getString('priority'),
      challengeId: getString('challengeId') ?? getString('challenge_id') ?? null,
      authorId: fallbackAuthorId ?? primaryAuthor?.userId ?? null,
      authorName: fallbackAuthorName ?? primaryAuthor?.name ?? null,
      relatedChallengeIds,
      kpis: Array.isArray(kpis) ? (kpis as Array<Record<string, unknown>>) : undefined,
      sourceMessageId: getString('sourceMessageId') ?? getString('source_message_id') ?? null,
      authors,
      authorsProvided,
    } satisfies NormalisedIncomingInsight;
  });

  return {
    types: types.length > 0 ? types : INSIGHT_TYPES,
    items,
  };
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
      .from('ask_sessions')
      .select('id, ask_key')
      .eq('ask_key', key)
      .maybeSingle<AskSessionRow>();

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
      .from('messages')
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at')
      .eq('ask_session_id', askRow.id)
      .order('created_at', { ascending: true });

    if (messageError) {
      throw messageError;
    }

    const { data: insightRows, error: insightError } = await supabase
      .from('insights')
      .select('id, ask_session_id, challenge_id, content, summary, type, category, status, priority, created_at, updated_at, related_challenge_ids, kpis, source_message_id, insight_authors (id, user_id, display_name)')
      .eq('ask_session_id', askRow.id)
      .order('created_at', { ascending: true });

    if (insightError) {
      throw insightError;
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

    const insightsPayload = {
      types: INSIGHT_TYPES,
      items: (insightRows ?? []).map((row) => {
        const insight = mapInsightRowToInsight(row);
        return {
          id: row.id,
          askSessionId: row.ask_session_id,
          content: row.content ?? null,
          summary: row.summary ?? null,
          type: row.type ?? null,
          category: row.category ?? null,
          status: row.status ?? null,
          priority: row.priority ?? null,
          challengeId: row.challenge_id ?? null,
          authors: insight.authors.map((author) => ({
            id: author.id,
            userId: author.userId ?? null,
            name: author.name ?? null,
          })),
          authorId: insight.authorId ?? null,
          authorName: insight.authorName ?? null,
          relatedChallengeIds: insight.relatedChallengeIds,
          sourceMessageId: insight.sourceMessageId ?? null,
          kpis: Array.isArray(row.kpis)
            ? row.kpis.map((kpi) => ({
              id: typeof kpi?.id === 'string' ? kpi.id : null,
              label: typeof kpi?.label === 'string' ? kpi.label : null,
              value: (kpi as any)?.value ?? null,
              description: typeof kpi?.description === 'string' ? kpi.description : null,
            }))
            : [],
        };
      }),
    } satisfies Record<string, unknown>;

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
        insights: insightsPayload,
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

    const incomingInsights = normaliseIncomingInsights(webhookData.insights);

    let refreshedInsights = insightRows ?? [];

    if (incomingInsights.items.length > 0) {
      const existingMap = (insightRows ?? []).reduce<Record<string, InsightRow>>((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {});

      for (const incoming of incomingInsights.items) {
        const nowIso = new Date().toISOString();
        const existing = incoming.id ? existingMap[incoming.id] : undefined;
        const desiredId = incoming.id ?? randomUUID();
        const normalisedKpis = normaliseIncomingKpis(incoming.kpis, existing?.kpis ?? []);

        if (existing) {
          const updatePayload = {
            ask_session_id: existing.ask_session_id,
            content: incoming.content ?? existing.content ?? '',
            summary: incoming.summary ?? existing.summary ?? null,
            type: (incoming.type as Insight['type']) ?? (existing.type as Insight['type']) ?? 'idea',
            category: incoming.category ?? existing.category ?? null,
            status: (incoming.status as Insight['status']) ?? (existing.status as Insight['status']) ?? 'new',
            priority: incoming.priority ?? existing.priority ?? null,
            challenge_id: incoming.challengeId ?? existing.challenge_id ?? null,
            related_challenge_ids: incoming.relatedChallengeIds ?? existing.related_challenge_ids ?? [],
            kpis: normalisedKpis,
            source_message_id: incoming.sourceMessageId ?? existing.source_message_id ?? null,
            updated_at: nowIso,
          };

          const { error: updateError } = await supabase
            .from('insights')
            .update(updatePayload)
            .eq('id', existing.id);

          if (updateError) {
            throw updateError;
          }

          if (incoming.authorsProvided) {
            await replaceInsightAuthors(supabase, existing.id, incoming.authors);
          }

          const updatedRow = await fetchInsightById(supabase, existing.id);
          if (updatedRow) {
            existingMap[existing.id] = updatedRow;
          }
        } else {
          const insertPayload = {
            id: desiredId,
            ask_session_id: askRow.id,
            content: incoming.content ?? '',
            summary: incoming.summary ?? null,
            type: (incoming.type as Insight['type']) ?? 'idea',
            category: incoming.category ?? null,
            status: (incoming.status as Insight['status']) ?? 'new',
            priority: incoming.priority ?? null,
            challenge_id: incoming.challengeId ?? null,
            related_challenge_ids: incoming.relatedChallengeIds ?? [],
            kpis: normalisedKpis,
            source_message_id: incoming.sourceMessageId ?? null,
            created_at: nowIso,
            updated_at: nowIso,
          };

          const { error: createdError } = await supabase
            .from('insights')
            .insert(insertPayload);

          if (createdError) {
            throw createdError;
          }

          if (incoming.authorsProvided) {
            await replaceInsightAuthors(supabase, desiredId, incoming.authors);
          }

          const createdRow = await fetchInsightById(supabase, desiredId);
          if (createdRow) {
            existingMap[createdRow.id] = createdRow;
          }
        }
      }

      const { data: latestInsights, error: latestError } = await supabase
        .from('insights')
        .select('id, ask_session_id, challenge_id, content, summary, type, category, status, priority, created_at, updated_at, related_challenge_ids, kpis, source_message_id, insight_authors (id, user_id, display_name)')
        .eq('ask_session_id', askRow.id)
        .order('created_at', { ascending: true });

      if (latestError) {
        throw latestError;
      }

      refreshedInsights = latestInsights ?? [];
    }

    const serialisedInsights = (refreshedInsights ?? insightRows ?? []).map(mapInsightRowToInsight);

    return NextResponse.json<ApiResponse<{ message: Message; insights: Insight[] }>>({
      success: true,
      data: { message, insights: serialisedInsights },
    });
  } catch (error) {
    console.error('Error triggering AI response:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
