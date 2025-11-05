import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export async function getAskSessionByKey<Row>(
  supabase: SupabaseClient,
  rawKey: string,
  columns: string
): Promise<{ row: Row | null; error: PostgrestError | null }> {
  const key = rawKey.trim();

  if (!key) {
    return { row: null, error: null };
  }

  const { data, error } = await supabase
    .from('ask_sessions')
    .select(columns)
    .eq('ask_key', key)
    .maybeSingle<Row>();

  if (error) {
    return { row: null, error };
  }

  return { row: data ?? null, error: null };
}

/**
 * Get ASK session by participant invite token
 * This allows each participant to have a unique link
 */
export async function getAskSessionByToken<Row>(
  supabase: SupabaseClient,
  token: string,
  columns: string
): Promise<{ row: Row | null; participantId: string | null; error: PostgrestError | null }> {
  const trimmedToken = token.trim();

  if (!trimmedToken) {
    return { row: null, participantId: null, error: null };
  }

  // First, find the participant by token
  const { data: participant, error: participantError } = await supabase
    .from('ask_participants')
    .select('ask_session_id, id')
    .eq('invite_token', trimmedToken)
    .maybeSingle<{ ask_session_id: string; id: string }>();

  if (participantError) {
    return { row: null, participantId: null, error: participantError };
  }

  if (!participant) {
    return { row: null, participantId: null, error: null };
  }

  // Then, get the ask session
  const { data: askSession, error: askError } = await supabase
    .from('ask_sessions')
    .select(columns)
    .eq('id', participant.ask_session_id)
    .maybeSingle<Row>();

  if (askError) {
    return { row: null, participantId: null, error: askError };
  }

  return { row: askSession ?? null, participantId: participant.id, error: null };
}
