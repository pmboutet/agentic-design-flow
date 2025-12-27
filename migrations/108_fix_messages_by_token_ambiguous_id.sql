-- Migration: Fix ambiguous column reference in get_ask_messages_by_token RPC
-- Error: column reference "id" is ambiguous (42702)
-- Fix: Rename output column from 'id' to 'message_id' to avoid conflict with table columns

-- Drop any existing versions to avoid overload ambiguity (PGRST203)
DROP FUNCTION IF EXISTS public.get_ask_messages_by_token(character varying);
DROP FUNCTION IF EXISTS public.get_ask_messages_by_token(text);

CREATE OR REPLACE FUNCTION public.get_ask_messages_by_token(p_token TEXT)
RETURNS TABLE (
  message_id UUID,
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
  WHERE ask_sessions.id = v_ask_session_id;

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
  -- Use explicit column aliases to avoid ambiguity with RETURNS TABLE columns
  RETURN QUERY
  SELECT
    msg.id AS message_id,
    msg.content AS content,
    msg.message_type::TEXT AS type,
    msg.sender_type::TEXT AS sender_type,
    msg.user_id AS sender_id,
    COALESCE(
      msg.metadata->>'senderName',
      prof.full_name,
      TRIM(COALESCE(prof.first_name, '') || ' ' || COALESCE(prof.last_name, '')),
      prof.email,
      NULL
    )::TEXT AS sender_name,
    msg.created_at AS created_at,
    msg.metadata AS metadata
  FROM public.messages msg
  LEFT JOIN public.profiles prof ON prof.id = msg.user_id
  WHERE msg.conversation_thread_id = v_thread_id
  ORDER BY msg.created_at ASC;
END;
$$;

NOTIFY pgrst, 'reload schema';
