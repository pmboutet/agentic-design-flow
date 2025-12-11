/**
 * Unified Conversation Context Module
 *
 * This module provides a single source of truth for fetching and building
 * conversation context used by AI agents across all modes:
 * - Text mode (stream/route.ts)
 * - Voice mode (voice-agent/init/route.ts)
 * - Test mode (admin/ai/agents/[id]/test/route.ts)
 *
 * IMPORTANT: Any changes to data fetching or message mapping should be made HERE
 * to ensure consistency across all modes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseMessageMetadata } from './messages';
import { getOrCreateConversationThread, getMessagesForThread, type AskSessionConfig } from './asks';
import { getConversationPlanWithSteps, type ConversationPlan } from './ai/conversation-plan';
import type { ConversationMessageSummary, ConversationParticipantSummary, ConversationAgentContext } from './ai/conversation-agent';

// ============================================================================
// Types
// ============================================================================

export interface ParticipantRow {
  id: string;
  participant_name?: string | null;
  participant_email?: string | null;
  role?: string | null;
  is_spokesperson?: boolean | null;
  user_id?: string | null;
  last_active?: string | null;
}

export interface UserRow {
  id: string;
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  description?: string | null;
}

export interface MessageRow {
  id: string;
  ask_session_id: string;
  user_id?: string | null;
  sender_type?: string | null;
  content: string;
  message_type?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  conversation_thread_id?: string | null;
  plan_step_id?: string | null;
}

export interface AskSessionRow {
  id: string;
  ask_key: string;
  question: string;
  description?: string | null;
  status?: string | null;
  system_prompt?: string | null;
  project_id?: string | null;
  challenge_id?: string | null;
  is_anonymous?: boolean | null;
  conversation_mode?: string | null;
  expected_duration_minutes?: number | null;
}

export interface ProjectRow {
  id: string;
  name?: string | null;
  system_prompt?: string | null;
}

export interface ChallengeRow {
  id: string;
  name?: string | null;
  system_prompt?: string | null;
}

/**
 * Extended message type used by streaming routes that need full message details.
 * This includes all fields from ConversationMessageSummary plus additional metadata.
 */
export interface DetailedMessage {
  id: string;
  askKey?: string;
  askSessionId: string;
  content: string;
  type: string;
  senderType: string;
  senderId: string | null;
  senderName: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  planStepId: string | null;
}

export interface ConversationContextResult {
  askSession: AskSessionRow;
  participants: ConversationParticipantSummary[];
  messages: ConversationMessageSummary[];
  project: ProjectRow | null;
  challenge: ChallengeRow | null;
  conversationPlan: ConversationPlan | null;
  conversationThread: { id: string; is_shared: boolean } | null;
  usersById: Record<string, UserRow>;
}

export interface FetchConversationContextOptions {
  profileId?: string | null;
  adminClient?: SupabaseClient; // For bypassing RLS when needed
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Build participant display name from participant row and user data.
 *
 * Priority:
 * 1. participant_name (explicit name set for this participation)
 * 2. User's full_name
 * 3. User's first_name + last_name
 * 4. User's email
 * 5. Fallback: "Participant {index + 1}"
 *
 * IMPORTANT: This is the SINGLE source of truth for participant display names.
 * Do NOT duplicate this logic elsewhere.
 */
export function buildParticipantDisplayName(
  participant: ParticipantRow,
  user: UserRow | null,
  index: number
): string {
  // Priority 1: Explicit participant name
  if (participant.participant_name && participant.participant_name.trim().length > 0) {
    return participant.participant_name.trim();
  }

  // Priority 2-4: User data
  if (user) {
    // Full name
    if (user.full_name && user.full_name.trim().length > 0) {
      return user.full_name.trim();
    }

    // First + last name
    const nameParts = [user.first_name, user.last_name]
      .filter(Boolean)
      .map(part => part!.trim())
      .filter(part => part.length > 0);
    if (nameParts.length > 0) {
      return nameParts.join(' ');
    }

    // Email as fallback
    if (user.email && user.email.trim().length > 0) {
      return user.email.trim();
    }
  }

  // Priority 5: Generic fallback
  return `Participant ${index + 1}`;
}

/**
 * Build message sender name from message metadata and user data.
 *
 * Priority:
 * 1. metadata.senderName (stored sender name)
 * 2. "Agent" for AI messages
 * 3. User's full_name
 * 4. User's first_name + last_name
 * 5. User's email
 * 6. Fallback: "Participant {index + 1}"
 *
 * IMPORTANT: This is the SINGLE source of truth for message sender names.
 * Do NOT duplicate this logic elsewhere.
 */
export function buildMessageSenderName(
  messageRow: MessageRow,
  user: UserRow | null,
  index: number
): string {
  // Parse metadata
  const metadata = normaliseMessageMetadata(messageRow.metadata);

  // Priority 1: Explicit sender name in metadata
  if (metadata && typeof metadata.senderName === 'string' && metadata.senderName.trim().length > 0) {
    return metadata.senderName.trim();
  }

  // Priority 2: AI messages always return "Agent"
  if (messageRow.sender_type === 'ai') {
    return 'Agent';
  }

  // Priority 3-5: User data
  if (user) {
    if (user.full_name && user.full_name.trim().length > 0) {
      return user.full_name.trim();
    }

    const nameParts = [user.first_name, user.last_name]
      .filter(Boolean)
      .map(part => part!.trim())
      .filter(part => part.length > 0);
    if (nameParts.length > 0) {
      return nameParts.join(' ');
    }

    if (user.email && user.email.trim().length > 0) {
      return user.email.trim();
    }
  }

  // Priority 6: Generic fallback
  return `Participant ${index + 1}`;
}

/**
 * Build a ConversationMessageSummary from a database message row.
 *
 * IMPORTANT: This function ensures consistent message mapping across ALL modes.
 * Always use this function when converting DB rows to ConversationMessageSummary.
 *
 * @param messageRow - Raw message row from database
 * @param user - User row for the message sender (if available)
 * @param index - Message index (for fallback naming)
 * @returns ConversationMessageSummary with all required fields including planStepId
 */
export function buildMessageSummary(
  messageRow: MessageRow,
  user: UserRow | null,
  index: number
): ConversationMessageSummary {
  return {
    id: messageRow.id,
    senderType: messageRow.sender_type ?? 'user',
    senderName: buildMessageSenderName(messageRow, user, index),
    content: messageRow.content,
    timestamp: messageRow.created_at ?? new Date().toISOString(),
    // CRITICAL: Always include planStepId for step variable support
    planStepId: messageRow.plan_step_id ?? null,
  };
}

/**
 * Build a DetailedMessage from a database message row.
 *
 * Used by streaming routes that need the full message object including metadata.
 * Uses the same sender name logic as buildMessageSummary for consistency.
 *
 * @param messageRow - Raw message row from database
 * @param user - User row for the message sender (if available)
 * @param index - Message index (for fallback naming)
 * @param askKey - Optional ASK key to include in the message
 * @returns DetailedMessage with all fields including metadata
 */
export function buildDetailedMessage(
  messageRow: MessageRow,
  user: UserRow | null,
  index: number,
  askKey?: string
): DetailedMessage {
  const metadata = normaliseMessageMetadata(messageRow.metadata);
  return {
    id: messageRow.id,
    askKey,
    askSessionId: messageRow.ask_session_id,
    content: messageRow.content,
    type: messageRow.message_type ?? 'text',
    senderType: messageRow.sender_type ?? 'user',
    senderId: messageRow.user_id ?? null,
    // Use the same sender name logic as buildMessageSummary
    senderName: buildMessageSenderName(messageRow, user, index),
    timestamp: messageRow.created_at ?? new Date().toISOString(),
    metadata,
    // CRITICAL: Always include planStepId for step variable support
    planStepId: messageRow.plan_step_id ?? null,
  };
}

/**
 * Build participant summary from participant row and user data.
 *
 * @param participantRow - Raw participant row from database
 * @param user - User row (if available)
 * @param index - Participant index (for fallback naming)
 * @returns ConversationParticipantSummary with name, role, and description
 */
export function buildParticipantSummary(
  participantRow: ParticipantRow,
  user: UserRow | null,
  index: number
): ConversationParticipantSummary {
  return {
    name: buildParticipantDisplayName(participantRow, user, index),
    role: participantRow.role ?? null,
    description: user?.description ?? null,
  };
}

// ============================================================================
// Data Fetching Functions
// ============================================================================

/**
 * Fetch users by their IDs and return a lookup map.
 */
export async function fetchUsersByIds(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Record<string, UserRow>> {
  if (userIds.length === 0) {
    return {};
  }

  const { data: userRows, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, first_name, last_name, description')
    .in('id', userIds);

  if (error) {
    console.warn('Failed to fetch users:', error);
    return {};
  }

  return (userRows ?? []).reduce<Record<string, UserRow>>((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});
}

/**
 * Fetch participants for an ASK session with their user data.
 */
export async function fetchParticipantsWithUsers(
  supabase: SupabaseClient,
  askSessionId: string
): Promise<{ participants: ConversationParticipantSummary[]; usersById: Record<string, UserRow> }> {
  // Fetch participants
  const { data: participantRows, error: participantError } = await supabase
    .from('ask_participants')
    .select('id, participant_name, participant_email, role, is_spokesperson, user_id, last_active')
    .eq('ask_session_id', askSessionId)
    .order('joined_at', { ascending: true });

  if (participantError) {
    console.warn('Failed to fetch participants:', participantError);
    return { participants: [], usersById: {} };
  }

  // Collect user IDs
  const participantUserIds = (participantRows ?? [])
    .map(row => row.user_id)
    .filter((value): value is string => Boolean(value));

  // Fetch user data
  const usersById = await fetchUsersByIds(supabase, participantUserIds);

  // Build participant summaries
  const participants = (participantRows ?? []).map((row, index) => {
    const user = row.user_id ? usersById[row.user_id] ?? null : null;
    return buildParticipantSummary(row, user, index);
  });

  return { participants, usersById };
}

/**
 * Fetch messages for a conversation thread (or all messages if no thread).
 * Returns messages as ConversationMessageSummary with consistent mapping.
 */
export async function fetchMessagesWithUsers(
  supabase: SupabaseClient,
  askSessionId: string,
  conversationThreadId: string | null,
  existingUsersById: Record<string, UserRow> = {}
): Promise<{ messages: ConversationMessageSummary[]; usersById: Record<string, UserRow> }> {
  let messageRows: MessageRow[] = [];

  if (conversationThreadId) {
    // Fetch messages for the specific thread
    const { messages: threadMessages, error: threadError } = await getMessagesForThread(
      supabase,
      conversationThreadId
    );

    if (threadError) {
      console.warn('Failed to fetch thread messages:', threadError);
    }

    // Also fetch messages without thread for backward compatibility
    const { data: messagesWithoutThread, error: noThreadError } = await supabase
      .from('messages')
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id, plan_step_id')
      .eq('ask_session_id', askSessionId)
      .is('conversation_thread_id', null)
      .order('created_at', { ascending: true });

    if (noThreadError) {
      console.warn('Failed to fetch messages without thread:', noThreadError);
    }

    // Combine and sort by timestamp
    const threadMessagesList = (threadMessages ?? []) as MessageRow[];
    const noThreadMessagesList = (messagesWithoutThread ?? []) as MessageRow[];
    messageRows = [...threadMessagesList, ...noThreadMessagesList].sort((a, b) => {
      const timeA = new Date(a.created_at ?? new Date().toISOString()).getTime();
      const timeB = new Date(b.created_at ?? new Date().toISOString()).getTime();
      return timeA - timeB;
    });
  } else {
    // Fallback: fetch all messages for the session
    const { data, error } = await supabase
      .from('messages')
      .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id, plan_step_id')
      .eq('ask_session_id', askSessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Failed to fetch messages:', error);
    }

    messageRows = (data ?? []) as MessageRow[];
  }

  // Collect additional user IDs not in existing lookup
  const messageUserIds = messageRows
    .map(row => row.user_id)
    .filter((value): value is string => Boolean(value));

  const additionalUserIds = messageUserIds.filter(id => !existingUsersById[id]);

  // Fetch additional user data
  let usersById = { ...existingUsersById };
  if (additionalUserIds.length > 0) {
    const additionalUsers = await fetchUsersByIds(supabase, additionalUserIds);
    usersById = { ...usersById, ...additionalUsers };
  }

  // Build message summaries with consistent mapping
  const messages = messageRows.map((row, index) => {
    const user = row.user_id ? usersById[row.user_id] ?? null : null;
    return buildMessageSummary(row, user, index);
  });

  return { messages, usersById };
}

/**
 * Fetch project data by ID.
 */
export async function fetchProject(
  supabase: SupabaseClient,
  projectId: string | null
): Promise<ProjectRow | null> {
  if (!projectId) {
    return null;
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, system_prompt')
    .eq('id', projectId)
    .maybeSingle<ProjectRow>();

  if (error) {
    console.warn('Failed to fetch project:', error);
    return null;
  }

  return data ?? null;
}

/**
 * Fetch challenge data by ID.
 */
export async function fetchChallenge(
  supabase: SupabaseClient,
  challengeId: string | null
): Promise<ChallengeRow | null> {
  if (!challengeId) {
    return null;
  }

  const { data, error } = await supabase
    .from('challenges')
    .select('id, name, system_prompt')
    .eq('id', challengeId)
    .maybeSingle<ChallengeRow>();

  if (error) {
    console.warn('Failed to fetch challenge:', error);
    return null;
  }

  return data ?? null;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Fetch complete conversation context for AI agent use.
 *
 * This is the SINGLE entry point for fetching all data needed by AI agents.
 * It ensures consistent data fetching and mapping across all modes:
 * - Text mode (stream/route.ts)
 * - Voice mode (voice-agent/init/route.ts)
 * - Test mode (admin/ai/agents/[id]/test/route.ts)
 *
 * @param supabase - Supabase client (regular or admin)
 * @param askSession - The ASK session row
 * @param options - Optional configuration
 * @returns Complete conversation context ready for buildConversationAgentVariables()
 */
export async function fetchConversationContext(
  supabase: SupabaseClient,
  askSession: AskSessionRow,
  options: FetchConversationContextOptions = {}
): Promise<ConversationContextResult> {
  const { profileId, adminClient } = options;

  // Use admin client for plan fetching if provided (to bypass RLS)
  const planClient = adminClient ?? supabase;

  // 1. Fetch participants with user data
  const { participants, usersById: participantUsersById } = await fetchParticipantsWithUsers(
    supabase,
    askSession.id
  );

  // 2. Get or create conversation thread
  const askConfig: AskSessionConfig = {
    conversation_mode: askSession.conversation_mode ?? null,
  };

  const { thread: conversationThread } = await getOrCreateConversationThread(
    supabase,
    askSession.id,
    profileId ?? null,
    askConfig
  );

  // 3. Fetch messages with user data
  const { messages, usersById } = await fetchMessagesWithUsers(
    supabase,
    askSession.id,
    conversationThread?.id ?? null,
    participantUsersById
  );

  // 4. Fetch project and challenge data in parallel
  const [project, challenge] = await Promise.all([
    fetchProject(supabase, askSession.project_id ?? null),
    fetchChallenge(supabase, askSession.challenge_id ?? null),
  ]);

  // 5. Fetch conversation plan (using admin client if available for RLS bypass)
  let conversationPlan: ConversationPlan | null = null;
  if (conversationThread) {
    conversationPlan = await getConversationPlanWithSteps(planClient, conversationThread.id);
  }

  return {
    askSession,
    participants,
    messages,
    project,
    challenge,
    conversationPlan,
    conversationThread: conversationThread
      ? { id: conversationThread.id, is_shared: conversationThread.is_shared }
      : null,
    usersById,
  };
}

