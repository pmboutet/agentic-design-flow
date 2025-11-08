import { Insight } from '@/types';

export const INSIGHT_TYPES: Insight['type'][] = ['pain', 'gain', 'opportunity', 'risk', 'signal', 'idea'];

export interface InsightAuthorRow {
  id: string;
  insight_id?: string | null;
  user_id?: string | null;
  display_name?: string | null;
}

export interface InsightRow {
  id: string;
  ask_session_id: string;
  ask_id?: string | null;
  challenge_id?: string | null;
  content?: string | null;
  summary?: string | null;
  type?: string | null;
  insight_type_id?: string | null;
  insight_type_name?: string | null;
  category?: string | null;
  status?: string | null;
  priority?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  related_challenge_ids?: string[] | null;
  kpis?: Array<Record<string, unknown>> | null;
  source_message_id?: string | null;
  conversation_thread_id?: string | null;
  insight_authors?: InsightAuthorRow[] | null;
}

// Helper function to safely get ask_id from a row, handling cases where the column might not exist
function getAskId(row: any): string | null {
  try {
    return row.ask_id ?? null;
  } catch (error) {
    // Column doesn't exist, return null
    return null;
  }
}

function isInsightType(value: unknown): value is Insight['type'] {
  return typeof value === 'string' && INSIGHT_TYPES.includes(value as Insight['type']);
}

function resolveInsightType(row: InsightRow): Insight['type'] {
  const candidate = [row.type, row.insight_type_name]
    .map((value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null))
    .find((value): value is string => typeof value === 'string' && value.length > 0);

  if (isInsightType(candidate)) {
    return candidate;
  }

  return 'idea';
}

export function mapInsightRowToInsight(row: InsightRow): Insight {
  const rawKpis = Array.isArray(row.kpis) ? row.kpis : [];
  const createdAt = row.created_at ?? new Date().toISOString();
  const updatedAt = row.updated_at ?? createdAt;
  const authorRows = Array.isArray(row.insight_authors) ? row.insight_authors : [];
  const authors = authorRows.map((author) => ({
    id: author.id,
    userId: author.user_id ?? null,
    name: author.display_name ?? null,
  }));
  const primaryAuthor = authors[0] ?? null;

  return {
    id: row.id,
    askId: row.ask_session_id ?? getAskId(row) ?? '',
    askSessionId: row.ask_session_id ?? getAskId(row) ?? '',
    challengeId: row.challenge_id ?? null,
    authorId: primaryAuthor?.userId ?? null,
    authorName: primaryAuthor?.name ?? null,
    authors,
    content: row.content ?? '',
    summary: row.summary ?? null,
    type: resolveInsightType(row),
    category: row.category ?? null,
    status: (row.status as Insight['status']) ?? 'new',
    priority: row.priority ?? null,
    createdAt,
    updatedAt,
    relatedChallengeIds: Array.isArray(row.related_challenge_ids) ? row.related_challenge_ids : [],
    kpis: rawKpis.map((kpi, index) => ({
      id: String((kpi as any)?.id ?? `kpi-${index}`),
      label: String((kpi as any)?.label ?? 'KPI'),
      value: (kpi as any)?.value ?? undefined,
      description: (kpi as any)?.description ?? null,
    })),
    sourceMessageId: row.source_message_id ?? null,
  };
}
