import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export interface ConversationThread {
  id: string;
  ask_session_id: string;
  user_id: string | null;
  is_shared: boolean;
  created_at: string;
}

export interface AskSessionConfig {
  conversation_mode?: string | null;
  // DEPRECATED: Use conversation_mode instead
  audience_scope?: string | null;
  response_mode?: string | null;
}

/**
 * Determine if an ASK session should use a shared thread
 *
 * Based on conversation_mode:
 *
 * - individual_parallel: Individual threads (is_shared = false)
 *   → Plusieurs personnes répondent individuellement, pas de visibilité croisée
 *   → Chaque utilisateur a son propre thread isolé
 *
 * - collaborative: Shared thread (is_shared = true)
 *   → Conversation multi-voix, tout le monde voit tout
 *   → Tous les participants partagent le même thread
 *
 * - group_reporter: Shared thread (is_shared = true)
 *   → Un groupe contribue avec un rapporteur
 *   → Tous les participants partagent le même thread
 *   → Un participant est désigné comme rapporteur (is_spokesperson)
 *
 * For backward compatibility, also supports legacy audience_scope + response_mode logic.
 */
export function shouldUseSharedThread(askSession: AskSessionConfig): boolean {
  // New logic: use conversation_mode if available
  if (askSession.conversation_mode) {
    // Only individual_parallel uses individual threads
    return askSession.conversation_mode !== 'individual_parallel';
  }

  // Legacy fallback: old logic using audience_scope + response_mode
  return (
    askSession.audience_scope === 'group' &&
    askSession.response_mode === 'collective'
  );
}

/**
 * Get or create a conversation thread for an ASK session
 *
 * Thread Logic based on conversation_mode:
 *
 * - individual_parallel: Individual threads (is_shared = false, user_id = specific user)
 *   → Chaque utilisateur a son propre thread isolé
 *   → Pas de visibilité croisée des messages et insights
 *
 * - collaborative: Shared thread (is_shared = true, user_id = NULL)
 *   → Tous les participants partagent le même thread
 *   → Tout le monde voit tous les messages et insights
 *
 * - group_reporter: Shared thread (is_shared = true, user_id = NULL)
 *   → Tous les participants partagent le même thread
 *   → Tout le monde voit tous les messages et insights
 *   → Un participant est désigné comme rapporteur (via is_spokesperson)
 *
 * Important: Si userId est fourni en mode individuel, le thread sera créé/recherché pour cet utilisateur spécifique.
 * Si userId est NULL en mode individuel, on bascule vers un thread partagé (fallback).
 */
export async function getOrCreateConversationThread(
  supabase: SupabaseClient,
  askSessionId: string,
  userId: string | null,
  askConfig: AskSessionConfig
): Promise<{ thread: ConversationThread | null; error: PostgrestError | null }> {
  const useShared = shouldUseSharedThread(askConfig);
  const threadUserId = useShared ? null : userId;

  // Try to find existing thread
  let query = supabase
    .from('conversation_threads')
    .select('id, ask_session_id, user_id, is_shared, created_at')
    .eq('ask_session_id', askSessionId);

  if (useShared) {
    query = query.is('user_id', null).eq('is_shared', true);
  } else {
    // In individual mode, we need a userId. If not provided, return null thread
    // (caller should handle fallback to shared thread or all messages)
    if (!threadUserId) {
      console.warn('Individual thread mode requires userId, but none provided. Falling back to shared thread behavior.');
      // Try to get shared thread as fallback
      const sharedQuery = supabase
        .from('conversation_threads')
        .select('id, ask_session_id, user_id, is_shared, created_at')
        .eq('ask_session_id', askSessionId)
        .is('user_id', null)
        .eq('is_shared', true)
        .maybeSingle<ConversationThread>();
      
      const { data: sharedThread, error: sharedError } = await sharedQuery;
      if (!sharedError && sharedThread) {
        return { thread: sharedThread, error: null };
      }
      // If no shared thread exists either, return null (caller will use fallback)
      return { thread: null, error: null };
    }
    query = query.eq('user_id', threadUserId).eq('is_shared', false);
  }

  const { data: existingThread, error: findError } = await query.maybeSingle<ConversationThread>();

  if (findError && findError.code !== 'PGRST116') {
    return { thread: null, error: findError };
  }

  if (existingThread) {
    return { thread: existingThread, error: null };
  }

  // Create new thread
  const { data: newThread, error: createError } = await supabase
    .from('conversation_threads')
    .insert({
      ask_session_id: askSessionId,
      user_id: threadUserId,
      is_shared: useShared,
    })
    .select('id, ask_session_id, user_id, is_shared, created_at')
    .single<ConversationThread>();

  if (createError) {
    return { thread: null, error: createError };
  }

  return { thread: newThread, error: null };
}

/**
 * Get messages for a specific conversation thread
 */
export async function getMessagesForThread(
  supabase: SupabaseClient,
  threadId: string
): Promise<{ messages: any[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    return { messages: [], error };
  }

  return { messages: data ?? [], error: null };
}

/**
 * Get insights for a specific conversation thread
 * Used for isolation in individual_parallel mode
 */
export async function getInsightsForThread(
  supabase: SupabaseClient,
  threadId: string
): Promise<{ insights: any[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .eq('conversation_thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    return { insights: [], error };
  }

  return { insights: data ?? [], error: null };
}

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
