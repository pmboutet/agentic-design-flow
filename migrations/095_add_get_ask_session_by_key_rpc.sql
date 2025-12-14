-- Migration 095: Add RPC function to get ASK session by key
-- This bypasses RLS via SECURITY DEFINER, similar to get_ask_session_by_token

BEGIN;

-- Function to get ASK session by key (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_ask_session_by_key(p_key text)
RETURNS TABLE (
  ask_session_id uuid,
  ask_key text,
  question text,
  description text,
  status text,
  project_id uuid,
  challenge_id uuid,
  conversation_mode text,
  expected_duration_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id as ask_session_id,
    a.ask_key::text,
    a.question::text,
    a.description::text,
    a.status::text,
    a.project_id,
    a.challenge_id,
    a.conversation_mode::text,
    a.expected_duration_minutes
  FROM ask_sessions a
  WHERE a.ask_key = p_key;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_ask_session_by_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ask_session_by_key(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ask_session_by_key(text) TO service_role;

COMMIT;
