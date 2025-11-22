-- Migration: Fix all token access functions to qualify ask_session_id
-- This ensures consistency and prevents any potential ambiguity issues

BEGIN;

-- ============================================================================
-- FUNCTION: Get participants for an ASK session (FIXED - consistency)
-- ============================================================================
-- Fix: Qualify ask_session_id with table name for consistency
CREATE OR REPLACE FUNCTION public.get_ask_participants_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  participant_id UUID,
  user_id UUID,
  participant_name TEXT,
  participant_email TEXT,
  role TEXT,
  is_spokesperson BOOLEAN,
  joined_at TIMESTAMPTZ
) AS $$
DECLARE
  v_ask_session_id UUID;
BEGIN
  -- Get ASK session ID from token
  -- Fix: Qualify ask_session_id with table name for consistency
  SELECT ap.ask_session_id INTO v_ask_session_id
  FROM public.ask_participants ap
  WHERE ap.invite_token = p_token
  LIMIT 1;
  
  -- If token not found, return empty
  IF v_ask_session_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Return participants (bypasses RLS but only for verified session)
  RETURN QUERY
  SELECT 
    ap.id,
    ap.user_id,
    ap.participant_name,
    ap.participant_email,
    ap.role,
    ap.is_spokesperson,
    ap.joined_at
  FROM public.ask_participants ap
  WHERE ap.ask_session_id = v_ask_session_id
  ORDER BY ap.joined_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get context for an ASK session (FIXED - consistency)
-- ============================================================================
-- Fix: Qualify ask_session_id with table name for consistency
CREATE OR REPLACE FUNCTION public.get_ask_context_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  challenge_id UUID,
  challenge_name TEXT
) AS $$
DECLARE
  v_ask_session_id UUID;
  v_project_id UUID;
  v_challenge_id UUID;
BEGIN
  -- Get ASK session ID from token
  -- Fix: Qualify ask_session_id with table name for consistency
  SELECT ap.ask_session_id INTO v_ask_session_id
  FROM public.ask_participants ap
  WHERE ap.invite_token = p_token
  LIMIT 1;
  
  IF v_ask_session_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get project and challenge IDs
  SELECT a.project_id, a.challenge_id INTO v_project_id, v_challenge_id
  FROM public.ask_sessions a
  WHERE a.id = v_ask_session_id;
  
  -- Return project and challenge info
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    c.id,
    c.name
  FROM public.projects p
  LEFT JOIN public.challenges c ON c.id = v_challenge_id
  WHERE p.id = v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.get_ask_participants_by_token(VARCHAR) IS 
  'Returns all participants for an ASK session identified by a valid invite token. Fixed to qualify ask_session_id with table name for consistency.';

COMMENT ON FUNCTION public.get_ask_context_by_token(VARCHAR) IS 
  'Returns project and challenge information for an ASK session identified by a valid invite token. Fixed to qualify ask_session_id with table name for consistency.';

COMMIT;

