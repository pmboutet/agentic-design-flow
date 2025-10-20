import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, Insight, Message } from '@/types';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { getAskSessionByKey } from '@/lib/asks';
import { normaliseMessageMetadata } from '@/lib/messages';
import { executeAgent, fetchAgentBySlug, type AgentExecutionResult } from '@/lib/ai';
import { INSIGHT_TYPES, mapInsightRowToInsight, type InsightRow } from '@/lib/insights';
import { fetchInsightRowById, fetchInsightsForSession, fetchInsightTypeMap } from '@/lib/insightQueries';

const CHAT_AGENT_SLUG = 'ask-conversation-response';
const INSIGHT_AGENT_SLUG = 'ask-insight-detection';
const CHAT_INTERACTION_TYPE = 'ask.chat.response';
const INSIGHT_INTERACTION_TYPE = 'ask.insight.detection';

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

function parseAgentJsonSafely(rawText: string): unknown | null {
  const attempts: string[] = [];
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  attempts.push(trimmed);

  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeFenceMatch && codeFenceMatch[1]) {
    attempts.push(codeFenceMatch[1].trim());
  }

  const bracketCandidate = extractBracketedJson(trimmed);
  if (bracketCandidate) {
    attempts.push(bracketCandidate);
  }

  for (const candidate of attempts) {
    const parsed = safeJsonParse(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function extractBracketedJson(value: string): string | null {
  const candidates: Array<{ start: number; opener: string; closer: string }> = [];

  const pushCandidate = (char: '[' | '{') => {
    const index = value.indexOf(char);
    if (index !== -1) {
      candidates.push({
        start: index,
        opener: char,
        closer: char === '{' ? '}' : ']',
      });
    }
  };

  pushCandidate('[');
  pushCandidate('{');

  for (const candidate of candidates) {
    const end = findMatchingBracket(value, candidate.start, candidate.opener, candidate.closer);
    if (end !== -1) {
      return value.slice(candidate.start, end + 1).trim();
    }
  }

  return null;
}

function findMatchingBracket(value: string, start: number, opener: string, closer: string): number {
  let depth = 0;
  let inString: false | '"' | '\'' = false;
  let isEscaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char === inString) {
        inString = false;
      }

      continue;
    }

    if (char === '"' || char === '\'') {
      inString = char;
      continue;
    }

    if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractTextFromRawResponse(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.content === 'string' && record.content.trim().length > 0) {
    return record.content.trim();
  }

  if (Array.isArray(record.content)) {
    const text = record.content
      .map(block => {
        if (!block) return '';
        if (typeof block === 'string') return block;
        const entry = block as Record<string, unknown>;
        if (typeof entry.text === 'string') {
          return entry.text;
        }
        if (Array.isArray(entry.content)) {
          return entry.content
            .map(inner => {
              if (!inner) return '';
              if (typeof inner === 'string') return inner;
              if (typeof (inner as any).text === 'string') return (inner as any).text;
              return '';
            })
            .join('');
        }
        return '';
      })
      .join('')
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  const choices = Array.isArray((record as any).choices) ? (record as any).choices : [];
  for (const choice of choices) {
    const message = choice?.message;
    if (message && typeof message.content === 'string' && message.content.trim().length > 0) {
      return message.content.trim();
    }
  }

  return null;
}

interface InsightJobRow {
  id: string;
  ask_session_id: string;
  status: string;
  attempts: number;
  started_at?: string | null;
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
  action?: string;
  mergedIntoId?: string | null;
  duplicateOfId?: string | null;
};

type NormalisedIncomingAuthor = {
  userId: string | null;
  name: string | null;
};

type NormalisedIncomingInsight = IncomingInsight & {
  authors: NormalisedIncomingAuthor[];
  authorsProvided: boolean;
};

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

function formatMessageHistory(messages: Message[]): string {
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

function serialiseInsightsForPrompt(insights: Insight[]): string {
  if (insights.length === 0) {
    return '[]';
  }

  const payload = insights.map((insight) => {
    const authors = (insight.authors ?? []).map((author) => ({
      userId: author.userId ?? null,
      name: author.name ?? null,
    }));

    const kpiEstimations = (insight.kpis ?? []).map((kpi) => ({
      name: kpi.label,
      description: kpi.description ?? null,
      metric_data: kpi.value ?? null,
    }));

    const entry: Record<string, unknown> = {
      id: insight.id,
      type: insight.type,
      content: insight.content,
      summary: insight.summary ?? null,
      category: insight.category ?? null,
      priority: insight.priority ?? null,
      status: insight.status,
      challengeId: insight.challengeId ?? null,
      relatedChallengeIds: insight.relatedChallengeIds ?? [],
      sourceMessageId: insight.sourceMessageId ?? null,
    };

    if (insight.authorId) {
      entry.authorId = insight.authorId;
    }

    if (insight.authorName) {
      entry.authorName = insight.authorName;
    }

    if (authors.length > 0) {
      entry.authors = authors;
    }

    if (kpiEstimations.length > 0) {
      entry.kpi_estimations = kpiEstimations;
    }

    return entry;
  });

  return JSON.stringify(payload);
}

function normaliseInsightTypeName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function resolveInsightTypeId(
  typeName: string | null,
  typeMap: Record<string, string>,
): string {
  const normalised = typeName ? typeName.trim().toLowerCase() : null;

  if (normalised && typeMap[normalised]) {
    return typeMap[normalised];
  }

  if (typeMap.idea) {
    return typeMap.idea;
  }

  const [fallbackId] = Object.values(typeMap);
  if (fallbackId) {
    return fallbackId;
  }

  throw new Error('No insight types configured');
}

async function replaceInsightAuthors(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
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

  type InsightAuthorInsert = {
    insight_id: string;
    user_id: string | null;
    display_name: string | null;
  };

  const rows = authors.reduce<InsightAuthorInsert[]>((acc, author) => {
    const name = typeof author.name === 'string' && author.name ? author.name : null;
    const userId = typeof author.userId === 'string' && author.userId ? author.userId : null;

    if (!name && !userId) {
      return acc;
    }

    acc.push({
      insight_id: insightId,
      user_id: userId,
      display_name: name,
    });

    return acc;
  }, []);

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
  const envelope = (typeof value === 'object' && value !== null && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : {};

  const rawTypes = Array.isArray(envelope.types) ? envelope.types : [];
  const types = rawTypes
    .map(type => (typeof type === 'string' ? type.trim() : ''))
    .filter((type): type is Insight['type'] => INSIGHT_TYPES.includes(type as Insight['type']));

  const rawItems = (() => {
    if (Array.isArray(value)) {
      return value;
    }
    if (Array.isArray(envelope.items)) {
      return envelope.items;
    }
    if (Array.isArray(envelope.insights)) {
      return envelope.insights;
    }
    return [];
  })();

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

    const actionValue = getString('action');

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
      action: actionValue ? actionValue.toLowerCase() : undefined,
      mergedIntoId: getString('mergedIntoId') ?? getString('merged_into_id') ?? getString('mergeTargetId') ?? null,
      duplicateOfId: getString('duplicateOfId') ?? getString('duplicate_of_id') ?? null,
    } satisfies NormalisedIncomingInsight;
  });

  return {
    types: types.length > 0 ? types : INSIGHT_TYPES,
    items,
  };
}

function sanitiseJsonString(raw: string): string {
  let trimmed = raw.trim();

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && typeof fencedMatch[1] === 'string') {
    const candidate = fencedMatch[1].trim();
    const bracketed = extractBracketedJson(candidate);
    return bracketed ?? candidate;
  }

  const bracketed = extractBracketedJson(trimmed);
  if (bracketed) {
    return bracketed;
  }

  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, '');
  }
  if (trimmed.endsWith('```')) {
    trimmed = trimmed.slice(0, -3);
  }

  return trimmed.trim();
}

async function persistInsights(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  askSessionId: string,
  incomingInsights: NormalisedIncomingInsight[],
  insightRows: InsightRow[],
) {
  if (incomingInsights.length === 0) {
    return;
  }

  const insightTypeMap = await fetchInsightTypeMap(supabase);
  if (Object.keys(insightTypeMap).length === 0) {
    throw new Error('No insight types configured');
  }

  const existingMap = insightRows.reduce<Record<string, InsightRow>>((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});

  const normaliseKey = (value?: string | null): string => {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
  };

  const contentIndex = new Map<string, InsightRow>();
  const summaryIndex = new Map<string, InsightRow>();
  const indexRow = (row: InsightRow | null | undefined) => {
    if (!row) return;
    const contentKey = normaliseKey(row.content ?? null);
    if (contentKey) contentIndex.set(contentKey, row);
    const summaryKey = normaliseKey(row.summary ?? null);
    if (summaryKey) summaryIndex.set(summaryKey, row);
  };

  const removeFromIndex = (row: InsightRow | null | undefined) => {
    if (!row) return;
    const contentKey = normaliseKey(row.content ?? null);
    if (contentKey) contentIndex.delete(contentKey);
    const summaryKey = normaliseKey(row.summary ?? null);
    if (summaryKey) summaryIndex.delete(summaryKey);
  };

  Object.values(existingMap).forEach(indexRow);

  const processedKeys = new Set<string>();

  for (const incoming of incomingInsights) {
    const nowIso = new Date().toISOString();
    const dedupeKey = [normaliseKey(incoming.content), normaliseKey(incoming.summary), incoming.type ?? ''].join('|');
    if (dedupeKey.trim().length > 0) {
      if (processedKeys.has(dedupeKey)) {
        continue;
      }
      processedKeys.add(dedupeKey);
    }

    let existing = incoming.id ? existingMap[incoming.id] : undefined;

    if (!existing && incoming.duplicateOfId && existingMap[incoming.duplicateOfId]) {
      existing = existingMap[incoming.duplicateOfId];
    }

    if (!existing) {
      const contentMatch = contentIndex.get(normaliseKey(incoming.content));
      const summaryMatch = summaryIndex.get(normaliseKey(incoming.summary));
      existing = contentMatch ?? summaryMatch ?? undefined;
    }

    const desiredId = incoming.id ?? randomUUID();
    const normalisedKpis = normaliseIncomingKpis(incoming.kpis, []);
    const providedType = normaliseInsightTypeName(incoming.type);
    const action = incoming.action ?? '';
    const targetRow = existing ?? null;

    if (action === 'delete' || action === 'remove' || action === 'obsolete') {
      if (targetRow) {
        await supabase.from('kpi_estimations').delete().eq('insight_id', targetRow.id);
        await supabase.from('insight_authors').delete().eq('insight_id', targetRow.id);
        await supabase.from('insights').delete().eq('id', targetRow.id);
        delete existingMap[targetRow.id];
        removeFromIndex(targetRow);
      }
      continue;
    }

    if (action === 'merge' && targetRow) {
      const mergeSummaryNote = incoming.summary ?? targetRow.summary ?? '';
      const mergedNote = incoming.mergedIntoId
        ? `${mergeSummaryNote}${mergeSummaryNote ? '\n\n' : ''}[Fusion] Fusionné avec l'insight ${incoming.mergedIntoId}`
        : mergeSummaryNote;

      const updatePayload = {
        ask_session_id: targetRow.ask_session_id,
        content: incoming.content ?? targetRow.content ?? '',
        summary: mergedNote,
        insight_type_id: targetRow.insight_type_id,
        category: incoming.category ?? targetRow.category ?? null,
        status: 'archived' as Insight['status'],
        priority: incoming.priority ?? targetRow.priority ?? null,
        challenge_id: incoming.challengeId ?? targetRow.challenge_id ?? null,
        related_challenge_ids: incoming.relatedChallengeIds ?? targetRow.related_challenge_ids ?? [],
        source_message_id: incoming.sourceMessageId ?? targetRow.source_message_id ?? null,
        updated_at: nowIso,
      } satisfies Record<string, unknown>;

      const { error: mergeUpdateErr } = await supabase
        .from('insights')
        .update(updatePayload)
        .eq('id', targetRow.id);

      if (mergeUpdateErr) {
        throw mergeUpdateErr;
      }

      await supabase.from('kpi_estimations').delete().eq('insight_id', targetRow.id);
      if (incoming.authorsProvided) {
        await replaceInsightAuthors(supabase, targetRow.id, incoming.authors);
      }

      const mergedRow = await fetchInsightRowById(supabase, targetRow.id);
      if (mergedRow) {
        existingMap[targetRow.id] = mergedRow;
        removeFromIndex(targetRow);
        indexRow(mergedRow);
      }
      continue;
    }

    if (existing) {
      const existingInsight = mapInsightRowToInsight(existing);
      const desiredTypeName = providedType ?? existingInsight.type ?? 'idea';
      const desiredTypeId = resolveInsightTypeId(desiredTypeName, insightTypeMap);

      const updatePayload = {
        ask_session_id: existing.ask_session_id,
        content: incoming.content ?? existing.content ?? '',
        summary: incoming.summary ?? existing.summary ?? null,
        insight_type_id: desiredTypeId,
        category: incoming.category ?? existing.category ?? null,
        status: (incoming.status as Insight['status']) ?? (existing.status as Insight['status']) ?? 'new',
        priority: incoming.priority ?? existing.priority ?? null,
        challenge_id: incoming.challengeId ?? existing.challenge_id ?? null,
        related_challenge_ids: incoming.relatedChallengeIds ?? existing.related_challenge_ids ?? [],
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

      await supabase.from('kpi_estimations').delete().eq('insight_id', existing.id);
      const kpiRowsUpdate = normalisedKpis.map((k) => ({
        insight_id: existing.id,
        name: typeof (k as any)?.label === 'string' ? (k as any).label : 'KPI',
        description: typeof (k as any)?.description === 'string' ? (k as any).description : null,
        metric_data: (k as any)?.value ?? null,
      }));
      if (kpiRowsUpdate.length > 0) {
        const { error: kpiUpdateErr } = await supabase.from('kpi_estimations').insert(kpiRowsUpdate);
        if (kpiUpdateErr) throw kpiUpdateErr;
      }

      if (incoming.authorsProvided) {
        await replaceInsightAuthors(supabase, existing.id, incoming.authors);
      }

      const updatedRow = await fetchInsightRowById(supabase, existing.id);
      if (updatedRow) {
        existingMap[existing.id] = updatedRow;
        removeFromIndex(existing);
        indexRow(updatedRow);
      }
    } else {
      const desiredTypeName = providedType ?? 'idea';
      const desiredTypeId = resolveInsightTypeId(desiredTypeName, insightTypeMap);

      const insertPayload = {
        id: desiredId,
        ask_session_id: askSessionId,
        content: incoming.content ?? '',
        summary: incoming.summary ?? null,
        insight_type_id: desiredTypeId,
        category: incoming.category ?? null,
        status: (incoming.status as Insight['status']) ?? 'new',
        priority: incoming.priority ?? null,
        challenge_id: incoming.challengeId ?? null,
        related_challenge_ids: incoming.relatedChallengeIds ?? [],
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

      const kpiRowsInsert = normalisedKpis.map((k) => ({
        insight_id: desiredId,
        name: typeof (k as any)?.label === 'string' ? (k as any).label : 'KPI',
        description: typeof (k as any)?.description === 'string' ? (k as any).description : null,
        metric_data: (k as any)?.value ?? null,
      }));
      if (kpiRowsInsert.length > 0) {
        const { error: kpiInsertErr } = await supabase.from('kpi_estimations').insert(kpiRowsInsert);
        if (kpiInsertErr) throw kpiInsertErr;
      }

      if (incoming.authorsProvided) {
        await replaceInsightAuthors(supabase, desiredId, incoming.authors);
      }

      const createdRow = await fetchInsightRowById(supabase, desiredId);
      if (createdRow) {
        existingMap[createdRow.id] = createdRow;
        indexRow(createdRow);
      }
    }
  }
}

async function findActiveInsightJob(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  askSessionId: string,
): Promise<InsightJobRow | null> {
  const { data, error } = await supabase
    .from('ai_insight_jobs')
    .select('id, ask_session_id, status, attempts, started_at')
    .eq('ask_session_id', askSessionId)
    .in('status', ['pending', 'processing'])
    .limit(1)
    .maybeSingle<InsightJobRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function createInsightJob(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  payload: { askSessionId: string; messageId?: string | null; agentId?: string | null }
): Promise<InsightJobRow> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('ai_insight_jobs')
    .insert({
      ask_session_id: payload.askSessionId,
      message_id: payload.messageId ?? null,
      agent_id: payload.agentId ?? null,
      status: 'processing',
      attempts: 1,
      started_at: nowIso,
      updated_at: nowIso,
    })
    .select('id, ask_session_id, status, attempts, started_at')
    .single<InsightJobRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function completeInsightJob(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  jobId: string,
  payload: { modelConfigId?: string | null }
) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('ai_insight_jobs')
    .update({
      status: 'completed',
      finished_at: nowIso,
      updated_at: nowIso,
      model_config_id: payload.modelConfigId ?? null,
    })
    .eq('id', jobId);

  if (error) {
    throw error;
  }
}

async function failInsightJob(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  jobId: string,
  payload: { error: string; attempts?: number; modelConfigId?: string | null }
) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('ai_insight_jobs')
    .update({
      status: 'failed',
      last_error: payload.error,
      finished_at: nowIso,
      updated_at: nowIso,
      attempts: payload.attempts ?? 1,
      model_config_id: payload.modelConfigId ?? null,
    })
    .eq('id', jobId);

  if (error) {
    throw error;
  }
}

function resolveInsightAgentPayload(result: AgentExecutionResult): unknown | null {
  const candidates = new Set<string>();

  const addCandidate = (value: string | null | undefined) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    candidates.add(trimmed);
  };

  addCandidate(typeof result.content === 'string' ? result.content : null);
  if (typeof result.content === 'string') {
    addCandidate(sanitiseJsonString(result.content));
  }
  addCandidate(extractTextFromRawResponse(result.raw));

  for (const candidate of candidates) {
    const parsed = parseAgentJsonSafely(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  if (result.raw && typeof result.raw === 'object') {
    const rawRecord = result.raw as Record<string, unknown>;
    if ('insights' in rawRecord || 'items' in rawRecord) {
      return rawRecord;
    }
  }

  return null;
}

async function triggerInsightDetection(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  options: {
    askSessionId: string;
    messageId?: string | null;
    variables: Record<string, string | null | undefined>;
  },
  existingInsights: InsightRow[],
): Promise<Insight[]> {
  const activeJob = await findActiveInsightJob(supabase, options.askSessionId);
  if (activeJob) {
    return existingInsights.map(mapInsightRowToInsight);
  }

  const insightAgent = await fetchAgentBySlug(supabase, INSIGHT_AGENT_SLUG, { includeModels: true });
  if (!insightAgent) {
    throw new Error('Insight detection agent is not configured');
  }

  const job = await createInsightJob(supabase, {
    askSessionId: options.askSessionId,
    messageId: options.messageId ?? null,
    agentId: insightAgent.id,
  });

  try {
    const result = await executeAgent({
      supabase,
      agentSlug: INSIGHT_AGENT_SLUG,
      askSessionId: options.askSessionId,
      messageId: options.messageId ?? null,
      interactionType: INSIGHT_INTERACTION_TYPE,
      variables: options.variables,
    });

    await supabase
      .from('ai_insight_jobs')
      .update({ model_config_id: result.modelConfig.id })
      .eq('id', job.id);

    const parsedPayload = (() => {
      const payload = resolveInsightAgentPayload(result);
      if (payload && typeof payload === 'object') {
        return payload;
      }

      throw new Error('Le contenu retourné par l’agent insight n’est pas un JSON valide.');
    })();

    const insightsSource = (typeof parsedPayload === 'object' && parsedPayload !== null && 'insights' in parsedPayload)
      ? (parsedPayload as Record<string, unknown>).insights
      : parsedPayload;

    const incoming = normaliseIncomingInsights(insightsSource);
    await persistInsights(supabase, options.askSessionId, incoming.items, existingInsights);

    await completeInsightJob(supabase, job.id, { modelConfigId: result.modelConfig.id });

    const refreshedInsights = await fetchInsightsForSession(supabase, options.askSessionId);
    return refreshedInsights.map(mapInsightRowToInsight);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during insight detection';
    await failInsightJob(supabase, job.id, {
      error: message,
      attempts: job.attempts,
    });
    throw error;
  }
}

function buildPromptVariables(options: {
  ask: AskSessionRow;
  project: ProjectRow | null;
  challenge: ChallengeRow | null;
  messages: Message[];
  participants: { name: string; role?: string | null }[];
  insights: Insight[];
  latestAiResponse?: string | null;
}): Record<string, string | null | undefined> {
  const history = formatMessageHistory(options.messages);
  const lastUserMessage = [...options.messages].reverse().find(message => message.senderType === 'user');

  const participantsSummary = options.participants
    .map(participant => participant.role ? `${participant.name} (${participant.role})` : participant.name)
    .join(', ');

  const existingInsightsSnapshot = JSON.stringify(
    options.insights.map(insight => ({
      id: insight.id,
      type: insight.type,
      content: insight.content,
      summary: insight.summary ?? null,
      category: insight.category ?? null,
      priority: insight.priority ?? null,
      status: insight.status ?? null,
    })),
  );

  return {
    ask_key: options.ask.ask_key,
    ask_question: options.ask.question,
    ask_description: options.ask.description ?? '',
    system_prompt_project: options.project?.system_prompt ?? '',
    system_prompt_challenge: options.challenge?.system_prompt ?? '',
    system_prompt_ask: options.ask.system_prompt ?? '',
    message_history: history,
    latest_user_message: lastUserMessage?.content ?? '',
    latest_ai_response: options.latestAiResponse ?? '',
    participant_name: lastUserMessage?.senderName ?? lastUserMessage?.metadata?.senderName ?? '',
    participants: participantsSummary,
    existing_insights_json: serialiseInsightsForPrompt(options.insights),
  } satisfies Record<string, string | null | undefined>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const { key } = params;
    const body = await request.json().catch(() => ({}));
    const typedBody = body as {
      detectInsights?: boolean;
      askSessionId?: string;
      mode?: string;
    };
    const { detectInsights, askSessionId, mode } = typedBody;
    const detectInsightsOnly = detectInsights === true;

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    const modeValue = typeof mode === 'string' ? mode : undefined;
    const insightsOnly = modeValue === 'insights-only';

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
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour la clé fournie'
      }, { status: 404 });
    }

    if (detectInsightsOnly) {
      if (typeof askSessionId !== 'string') {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'ASK session identifier is required for insight detection',
        }, { status: 400 });
      }

      if (askSessionId !== askRow.id) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'ASK session mismatch',
        }, { status: 400 });
      }
    }

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
        .from('profiles')
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
        .from('profiles')
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


    const insightRows = await fetchInsightsForSession(supabase, askRow.id);
    const existingInsights = insightRows.map(mapInsightRowToInsight);

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
      insights: existingInsights,
    });

    if (detectInsightsOnly) {
      try {
        const lastAiMessage = [...messages].reverse().find(message => message.senderType === 'ai');

        const detectionVariables = buildPromptVariables({
          ask: askRow,
          project: projectData,
          challenge: challengeData,
          messages,
          participants: participantSummaries,
          insights: existingInsights,
          latestAiResponse: lastAiMessage?.content ?? null,
        });

        const refreshedInsights = await triggerInsightDetection(
          supabase,
          {
            askSessionId: askRow.id,
            messageId: lastAiMessage?.id ?? null,
            variables: detectionVariables,
          },
          insightRows,
        );

        return NextResponse.json<ApiResponse<{ insights: Insight[] }>>({
          success: true,
          data: { insights: refreshedInsights },
        });
      } catch (error) {
        console.error('Insight detection failed', error);
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Failed to detect insights'
        }, { status: 500 });
      }
    }

    let message: Message | undefined;
    let latestAiResponse = '';
    let detectionMessageId: string | null = null;

    if (!insightsOnly) {
      const promptVariables = buildPromptVariables({
        ask: askRow,
        project: projectData,
        challenge: challengeData,
        messages,
        participants: participantSummaries,
        insights: existingInsights,
      });

      const aiResult = await executeAgent({
        supabase,
        agentSlug: CHAT_AGENT_SLUG,
        askSessionId: askRow.id,
        interactionType: CHAT_INTERACTION_TYPE,
        variables: promptVariables,
      });

      if (typeof aiResult.content === 'string' && aiResult.content.trim().length > 0) {
        latestAiResponse = aiResult.content.trim();
        const aiMetadata = { senderName: 'Agent' } satisfies Record<string, unknown>;

        const { data: insertedRows, error: insertError } = await supabase
          .from('messages')
          .insert({
            ask_session_id: askRow.id,
            content: latestAiResponse,
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

        message = {
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

        messages.push(message);
        detectionMessageId = message.id;
      }
    } else {
      const latestAiMessage = [...messages].reverse().find(msg => msg.senderType === 'ai');
      if (latestAiMessage) {
        latestAiResponse = latestAiMessage.content;
        detectionMessageId = latestAiMessage.id;
      }
    }

    const detectionVariables = buildPromptVariables({
      ask: askRow,
      project: projectData,
      challenge: challengeData,
      messages,
      participants: participantSummaries,
      insights: existingInsights,
      latestAiResponse,
    });

    let refreshedInsights: Insight[] = existingInsights;

    try {
      refreshedInsights = await triggerInsightDetection(
        supabase,
        {
          askSessionId: askRow.id,
          messageId: detectionMessageId,
          variables: detectionVariables,
        },
        insightRows,
      );
    } catch (error) {
      console.error('Insight detection failed', error);
      throw error;
    }

    return NextResponse.json<ApiResponse<{ message?: Message; insights: Insight[] }>>({
      success: true,
      data: { message, insights: refreshedInsights },
    });
  } catch (error) {
    console.error('Error executing AI response pipeline:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
