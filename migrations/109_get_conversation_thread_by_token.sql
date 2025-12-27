-- Migration: Create get_conversation_thread_by_token RPC
-- This function finds the correct conversation thread for a user based on their invite token
-- Handles individual_parallel mode by finding the user's specific thread

CREATE OR REPLACE FUNCTION public.get_conversation_thread_by_token(p_token TEXT)
RETURNS TABLE (
  thread_id UUID,
  ask_session_id UUID,
  user_id UUID,
  is_shared BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ask_session_id UUID;
  v_user_id UUID;
  v_conversation_mode TEXT;
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
  SELECT a.conversation_mode INTO v_conversation_mode
  FROM public.ask_sessions a
  WHERE a.id = v_ask_session_id;

  -- Determine which thread to return based on conversation mode
  IF v_conversation_mode = 'individual_parallel' THEN
    -- Individual mode: get user's specific thread
    RETURN QUERY
    SELECT ct.id, ct.ask_session_id, ct.user_id, ct.is_shared, ct.created_at
    FROM public.conversation_threads ct
    WHERE ct.ask_session_id = v_ask_session_id
      AND ct.user_id = v_user_id
      AND ct.is_shared = false
    LIMIT 1;
  ELSE
    -- Shared mode: get the shared thread
    RETURN QUERY
    SELECT ct.id, ct.ask_session_id, ct.user_id, ct.is_shared, ct.created_at
    FROM public.conversation_threads ct
    WHERE ct.ask_session_id = v_ask_session_id
      AND ct.is_shared = true
    LIMIT 1;
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_conversation_thread_by_token TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
