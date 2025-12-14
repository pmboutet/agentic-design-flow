-- Migration 090: Add RPC function for conversation thread operations
-- This bypasses RLS via SECURITY DEFINER, similar to other token-based functions

BEGIN;

-- Function to get or create a conversation thread
CREATE OR REPLACE FUNCTION public.get_or_create_conversation_thread(
  p_ask_session_id uuid,
  p_user_id uuid,
  p_use_shared boolean
)
RETURNS TABLE (
  thread_id uuid,
  ask_session_id uuid,
  user_id uuid,
  is_shared boolean,
  created_at timestamptz,
  was_created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id uuid;
  v_thread_user_id uuid;
  v_is_shared boolean;
  v_created_at timestamptz;
  v_was_created boolean := false;
BEGIN
  -- Determine the user_id for the thread query
  v_thread_user_id := CASE WHEN p_use_shared THEN NULL ELSE p_user_id END;
  v_is_shared := p_use_shared;

  -- Try to find existing thread
  IF p_use_shared THEN
    -- Look for shared thread (user_id IS NULL, is_shared = true)
    SELECT ct.id, ct.ask_session_id, ct.user_id, ct.is_shared, ct.created_at
    INTO v_thread_id, ask_session_id, user_id, is_shared, v_created_at
    FROM conversation_threads ct
    WHERE ct.ask_session_id = p_ask_session_id
      AND ct.user_id IS NULL
      AND ct.is_shared = true
    ORDER BY ct.created_at ASC
    LIMIT 1;
  ELSE
    -- Look for individual thread
    IF p_user_id IS NULL THEN
      -- Fallback to shared thread if no user_id provided
      SELECT ct.id, ct.ask_session_id, ct.user_id, ct.is_shared, ct.created_at
      INTO v_thread_id, ask_session_id, user_id, is_shared, v_created_at
      FROM conversation_threads ct
      WHERE ct.ask_session_id = p_ask_session_id
        AND ct.user_id IS NULL
        AND ct.is_shared = true
      ORDER BY ct.created_at ASC
      LIMIT 1;
      v_is_shared := true;
    ELSE
      -- Look for user-specific thread
      SELECT ct.id, ct.ask_session_id, ct.user_id, ct.is_shared, ct.created_at
      INTO v_thread_id, ask_session_id, user_id, is_shared, v_created_at
      FROM conversation_threads ct
      WHERE ct.ask_session_id = p_ask_session_id
        AND ct.user_id = p_user_id
        AND ct.is_shared = false
      ORDER BY ct.created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  -- Create thread if not found
  IF v_thread_id IS NULL THEN
    INSERT INTO conversation_threads (ask_session_id, user_id, is_shared)
    VALUES (p_ask_session_id, v_thread_user_id, v_is_shared)
    RETURNING id, conversation_threads.ask_session_id, conversation_threads.user_id, conversation_threads.is_shared, conversation_threads.created_at
    INTO v_thread_id, ask_session_id, user_id, is_shared, v_created_at;
    v_was_created := true;
  END IF;

  thread_id := v_thread_id;
  created_at := v_created_at;
  was_created := v_was_created;

  RETURN NEXT;
END;
$$;

-- Function to get messages for a thread
CREATE OR REPLACE FUNCTION public.get_messages_for_thread(p_thread_id uuid)
RETURNS TABLE (
  message_id uuid,
  ask_session_id uuid,
  user_id uuid,
  sender_type text,
  content text,
  message_type text,
  metadata jsonb,
  created_at timestamptz,
  conversation_thread_id uuid,
  plan_step_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id as message_id,
    m.ask_session_id,
    m.user_id,
    m.sender_type,
    m.content,
    m.message_type,
    m.metadata,
    m.created_at,
    m.conversation_thread_id,
    m.plan_step_id
  FROM messages m
  WHERE m.conversation_thread_id = p_thread_id
  ORDER BY m.created_at ASC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation_thread(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation_thread(uuid, uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.get_messages_for_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_messages_for_thread(uuid) TO anon;

COMMIT;
