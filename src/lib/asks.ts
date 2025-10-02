import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

function escapeIlikePattern(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1');
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

  const fallbackPattern = escapeIlikePattern(key);

  const { data: fallbackRows, error: fallbackError } = await supabase
    .from('ask_sessions')
    .select(columns)
    .ilike('ask_key', fallbackPattern)
    .order('created_at', { ascending: false })
    .limit(1);

  if (fallbackError) {
    return { row: null, error: fallbackError };
  }

  const fallbackRow = Array.isArray(fallbackRows) && fallbackRows.length > 0
    ? (fallbackRows[0] as Row)
    : null;

  return { row: fallbackRow ?? null, error: null };
}
