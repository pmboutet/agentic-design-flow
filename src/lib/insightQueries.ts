import type { SupabaseClient } from '@supabase/supabase-js';
import type { InsightAuthorRow, InsightRow } from './insights';

const INSIGHT_COLUMNS_WITH_ASK_ID = 'id, ask_session_id, ask_id, challenge_id, content, summary, type, category, status, priority, created_at, updated_at, related_challenge_ids, kpis, source_message_id';
const INSIGHT_COLUMNS_LEGACY = 'id, ask_session_id, challenge_id, content, summary, type, category, status, priority, created_at, updated_at, related_challenge_ids, kpis, source_message_id';

function isMissingAskIdColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = (error as { message?: string }).message;
  return typeof message === 'string' && message.includes('column insights.ask_id does not exist');
}

async function hydrateInsightAuthors(
  supabase: SupabaseClient,
  rows: InsightRow[],
): Promise<InsightRow[]> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const insightIds = rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (insightIds.length === 0) {
    return rows.map((row) => ({ ...row, insight_authors: [] }));
  }

  const { data, error } = await supabase
    .from('insight_authors')
    .select('id, insight_id, user_id, display_name')
    .in('insight_id', insightIds);

  if (error) {
    throw error;
  }

  const authorsByInsight = insightIds.reduce<Record<string, InsightAuthorRow[]>>((acc, id) => {
    acc[id] = [];
    return acc;
  }, {});

  for (const row of data ?? []) {
    const insightId = typeof row.insight_id === 'string' ? row.insight_id : null;

    if (!insightId) {
      continue;
    }

    if (!authorsByInsight[insightId]) {
      authorsByInsight[insightId] = [];
    }

    authorsByInsight[insightId].push({
      id: row.id,
      insight_id: insightId,
      user_id: row.user_id ?? null,
      display_name: row.display_name ?? null,
    });
  }

  return rows.map((row) => ({
    ...row,
    insight_authors: authorsByInsight[row.id] ?? [],
  }));
}

async function selectInsightRows(
  supabase: SupabaseClient,
  builder: (query: any) => any,
): Promise<InsightRow[]> {
  let query = supabase
    .from('insights')
    .select(INSIGHT_COLUMNS_WITH_ASK_ID);

  query = builder(query);

  const { data, error } = await query;

  if (!error) {
    return hydrateInsightAuthors(supabase, (data ?? []) as InsightRow[]);
  }

  if (!isMissingAskIdColumnError(error)) {
    throw error;
  }

  let legacyQuery = supabase
    .from('insights')
    .select(INSIGHT_COLUMNS_LEGACY);

  legacyQuery = builder(legacyQuery);

  const fallbackResult = await legacyQuery;

  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  const rows = (fallbackResult.data ?? []).map((row) => ({
    ...row,
    ask_id: null,
  })) as InsightRow[];

  return hydrateInsightAuthors(supabase, rows);
}

export async function fetchInsightsForSession(
  supabase: SupabaseClient,
  askSessionId: string,
): Promise<InsightRow[]> {
  return selectInsightRows(supabase, (query) =>
    query
      .eq('ask_session_id', askSessionId)
      .order('created_at', { ascending: true }),
  );
}

export async function fetchInsightRowById(
  supabase: SupabaseClient,
  insightId: string,
): Promise<InsightRow | null> {
  const rows = await selectInsightRows(supabase, (query) => query.eq('id', insightId).limit(1));
  return rows[0] ?? null;
}
