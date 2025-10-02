import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

function escapeIlikeSegment(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1');
}

function buildExactIlikePattern(value: string): string {
  return escapeIlikeSegment(value);
}

function buildFuzzyIlikePattern(value: string): string | null {
  const parts = value
    .split(/[-._\s]+/)
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(escapeIlikeSegment);

  if (parts.length === 0) {
    return null;
  }

  if (parts.length === 1) {
    return `%${parts[0]}%`;
  }

  return `%${parts.join('%')}%`;
}

export async function getAskSessionByKey<Row>(
  supabase: SupabaseClient,
  rawKey: string,
  columns: string
): Promise<{ row: Row | null; error: PostgrestError | null }> {
  const key = rawKey.trim();

  const { data, error } = await supabase
    .from('ask_sessions')
    .select(columns)
    .eq('ask_key', key)
    .maybeSingle<Row>();

  if (error) {
    return { row: null, error };
  }

  if (data) {
    return { row: data, error: null };
  }

  const fallbackPattern = buildExactIlikePattern(key);

  const { data: fallbackRow, error: fallbackError } = await supabase
    .from('ask_sessions')
    .select(columns)
    .ilike('ask_key', fallbackPattern)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Row>();

  if (fallbackError) {
    return { row: null, error: fallbackError };
  }

  if (fallbackRow) {
    return { row: fallbackRow, error: null };
  }

  const fuzzyPattern = buildFuzzyIlikePattern(key);

  if (!fuzzyPattern || fuzzyPattern === fallbackPattern) {
    return { row: null, error: null };
  }

  const { data: fuzzyRow, error: fuzzyError } = await supabase
    .from('ask_sessions')
    .select(columns)
    .ilike('ask_key', fuzzyPattern)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Row>();

  if (fuzzyError) {
    return { row: null, error: fuzzyError };
  }

  return { row: fuzzyRow ?? null, error: null };
}
