-- Migration: Fix get_ask_messages_by_token RPC
-- Bug: Was filtering by ask_session_id, returning ALL session messages
-- Fix: Now filters by conversation_thread_id for the specific user's thread
-- This is critical for individual_parallel mode where each user has their own thread

-- Drop any existing versions to avoid overload ambiguity (PGRST203)
DROP FUNCTION IF EXISTS public.get_ask_messages_by_token(character varying);
DROP FUNCTION IF EXISTS public.get_ask_messages_by_token(text);

CREATE OR REPLACE FUNCTION public.get_ask_messages_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  content TEXT,
  type TEXT,
  sender_type TEXT,
  sender_id UUID,
  sender_name TEXT,
  created_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ask_session_id UUID;
  v_user_id UUID;
  v_conversation_mode TEXT;
  v_thread_id UUID;
BEGIN
  -- Get ASK session ID and user ID from token
  SELECT ap.ask_session_id, ap.user_id INTO v_ask_session_id, v_user_id
  FROM public.ask_participants ap
  WHERE ap.invite_token = p_token
  LIMIT 1;

  IF v_ask_session_id IS NULL THEN
    RETURN;
  END IF;

  -- Get conversation mode
  SELECT conversation_mode INTO v_conversation_mode
  FROM public.ask_sessions
  WHERE id = v_ask_session_id;

  -- Determine which thread to query based on conversation mode
  IF v_conversation_mode = 'individual_parallel' THEN
    -- Individual mode: get user's specific thread
    SELECT ct.id INTO v_thread_id
    FROM public.conversation_threads ct
    WHERE ct.ask_session_id = v_ask_session_id
      AND ct.user_id = v_user_id
      AND ct.is_shared = false
    LIMIT 1;
  ELSE
    -- Shared mode: get the shared thread
    SELECT ct.id INTO v_thread_id
    FROM public.conversation_threads ct
    WHERE ct.ask_session_id = v_ask_session_id
      AND ct.is_shared = true
    LIMIT 1;
  END IF;

  -- If no thread found, return empty
  IF v_thread_id IS NULL THEN
    RETURN;
  END IF;

  -- Return messages for the specific thread only
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.message_type AS type,
    m.sender_type,
    m.user_id AS sender_id,
    COALESCE(
      m.metadata->>'senderName',
      p.full_name,
      TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
      p.email,
      NULL
    ) AS sender_name,
    m.created_at,
    m.metadata
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.conversation_thread_id = v_thread_id
  ORDER BY m.created_at ASC;
END;
$$;

NOTIFY pgrst, 'reload schema';
