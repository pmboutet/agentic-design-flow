/**
 * useRealtimeMessages - Hook for real-time message synchronization
 *
 * Subscribes to Supabase Realtime for message INSERT events on a specific conversation thread.
 * Used in shared thread modes (collaborative, group_reporter, consultant) so all participants
 * see messages from others in real-time.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Message } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

type SubscriptionStatus = 'idle' | 'subscribing' | 'subscribed' | 'error';

export interface UseRealtimeMessagesConfig {
  /**
   * The conversation thread ID to subscribe to
   */
  conversationThreadId: string | null;

  /**
   * ASK key for message formatting
   */
  askKey: string;

  /**
   * Whether realtime is enabled (should be true for shared thread modes)
   */
  enabled?: boolean;

  /**
   * Callback when a new message is received
   */
  onNewMessage: (message: Message) => void;

  /**
   * Current user's participant ID to avoid duplicating own messages
   */
  currentParticipantId?: string | null;
}

interface DatabaseMessageRow {
  id: string;
  ask_session_id: string;
  conversation_thread_id: string | null;
  user_id: string | null;
  sender_type: string;
  content: string;
  message_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  parent_message_id: string | null;
  plan_step_id: string | null;
}

/**
 * Transform a database row into a Message object
 */
function formatDatabaseMessage(row: DatabaseMessageRow, askKey: string): Message {
  const metadata = row.metadata ?? {};

  return {
    id: row.id,
    clientId: row.id, // Use server ID as client ID for realtime messages
    askKey,
    askSessionId: row.ask_session_id,
    conversationThreadId: row.conversation_thread_id,
    content: row.content,
    type: (row.message_type as Message['type']) ?? 'text',
    senderType: (row.sender_type as Message['senderType']) ?? 'user',
    senderId: row.user_id,
    senderName: (metadata.senderName as string) ?? (row.sender_type === 'ai' ? 'Agent' : null),
    timestamp: row.created_at ?? new Date().toISOString(),
    metadata: metadata as Message['metadata'],
  };
}

export function useRealtimeMessages({
  conversationThreadId,
  askKey,
  enabled = true,
  onNewMessage,
  currentParticipantId,
}: UseRealtimeMessagesConfig) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const processedIdsRef = useRef<Set<string>>(new Set());
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  // Stable callback ref to avoid recreating subscription
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;

  const handleNewMessage = useCallback((payload: { new: DatabaseMessageRow }) => {
    const row = payload.new;

    console.log('[useRealtimeMessages] 📨 Realtime event received:', {
      id: row.id,
      senderType: row.sender_type,
      userId: row.user_id,
      threadId: row.conversation_thread_id,
      contentPreview: row.content?.substring(0, 30),
    });

    // Skip if we've already processed this message (dedup)
    if (processedIdsRef.current.has(row.id)) {
      console.log('[useRealtimeMessages] ⏭️ Skipping duplicate message:', row.id);
      return;
    }

    // Mark as processed
    processedIdsRef.current.add(row.id);

    // Limit the set size to prevent memory leaks
    if (processedIdsRef.current.size > 1000) {
      const arr = Array.from(processedIdsRef.current);
      processedIdsRef.current = new Set(arr.slice(-500));
    }

    console.log('[useRealtimeMessages] ✅ Processing new message:', {
      id: row.id,
      senderType: row.sender_type,
      contentPreview: row.content?.substring(0, 50),
    });

    const message = formatDatabaseMessage(row, askKey);
    onNewMessageRef.current(message);
  }, [askKey]);

  useEffect(() => {
    // Don't subscribe if disabled or no thread ID
    if (!enabled || !conversationThreadId || !supabase) {
      console.log('[useRealtimeMessages] Not subscribing:', {
        enabled,
        hasThreadId: !!conversationThreadId,
        hasSupabase: !!supabase,
      });
      setSubscriptionStatus('idle');
      return;
    }

    console.log('[useRealtimeMessages] 🔴 Setting up subscription for thread:', {
      threadId: conversationThreadId,
      channelName: `messages:thread:${conversationThreadId}`,
      filter: `conversation_thread_id=eq.${conversationThreadId}`,
    });

    setSubscriptionStatus('subscribing');
    setLastError(null);

    // Create channel for this conversation thread
    const channelName = `messages:thread:${conversationThreadId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_thread_id=eq.${conversationThreadId}`,
        },
        handleNewMessage
      )
      .subscribe((status, err) => {
        console.log('[useRealtimeMessages] Subscription status:', status, err ? `Error: ${err.message}` : '');

        if (status === 'SUBSCRIBED') {
          setSubscriptionStatus('subscribed');
          console.log('[useRealtimeMessages] ✅ Successfully subscribed to realtime messages');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setSubscriptionStatus('error');
          const errorMessage = err?.message || `Subscription ${status}`;
          setLastError(errorMessage);
          console.error('[useRealtimeMessages] ❌ Subscription error:', errorMessage);
        } else if (status === 'CLOSED') {
          setSubscriptionStatus('idle');
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount or when dependencies change
    return () => {
      console.log('[useRealtimeMessages] Cleaning up subscription for thread:', conversationThreadId);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setSubscriptionStatus('idle');
    };
  }, [enabled, conversationThreadId, handleNewMessage]);

  // Clear processed IDs when thread changes
  useEffect(() => {
    processedIdsRef.current.clear();
  }, [conversationThreadId]);

  return {
    isSubscribed: subscriptionStatus === 'subscribed',
    subscriptionStatus,
    lastError,
  };
}
