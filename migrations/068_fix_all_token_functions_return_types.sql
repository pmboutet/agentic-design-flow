-- Migration: Fix return types for all token access functions
-- All TEXT columns in RETURNS TABLE must match actual VARCHAR columns in tables

BEGIN;

-- ============================================================================
-- FUNCTION: Get participant info by token (FIXED - return types)
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_participant_by_token(VARCHAR);

CREATE OR REPLACE FUNCTION public.get_participant_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  participant_id UUID,
  user_id UUID,
  participant_name VARCHAR,  -- Fixed: VARCHAR to match ask_participants.participant_name
  participant_email VARCHAR,  -- Fixed: VARCHAR to match ask_participants.participant_email
  role VARCHAR,  -- Fixed: VARCHAR to match ask_participants.role
  is_spokesperson BOOLEAN,
  invite_token VARCHAR(255),
  joined_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ap.id,
    ap.user_id,
    ap.participant_name,
    ap.participant_email,
    ap.role,
    ap.is_spokesperson,
    ap.invite_token,
    ap.joined_at
  FROM public.ask_participants ap
  WHERE ap.invite_token = p_token
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get participants for an ASK session (FIXED - return types)
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_ask_participants_by_token(VARCHAR);

CREATE OR REPLACE FUNCTION public.get_ask_participants_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  participant_id UUID,
  user_id UUID,
  participant_name VARCHAR,  -- Fixed: VARCHAR to match ask_participants.participant_name
  participant_email VARCHAR,  -- Fixed: VARCHAR to match ask_participants.participant_email
  role VARCHAR,  -- Fixed: VARCHAR to match ask_participants.role
  is_spokesperson BOOLEAN,
  joined_at TIMESTAMPTZ
) AS $$
DECLARE
  v_ask_session_id UUID;
BEGIN
  -- Get ASK session ID from token
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
-- FUNCTION: Get context for an ASK session (FIXED - return types)
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_ask_context_by_token(VARCHAR);

CREATE OR REPLACE FUNCTION public.get_ask_context_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  project_id UUID,
  project_name VARCHAR,  -- Fixed: VARCHAR to match projects.name
  challenge_id UUID,
  challenge_name VARCHAR  -- Fixed: VARCHAR to match challenges.name
) AS $$
DECLARE
  v_ask_session_id UUID;
  v_project_id UUID;
  v_challenge_id UUID;
BEGIN
  -- Get ASK session ID from token
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
-- FUNCTION: Get insights for an ASK session (FIXED - return types)
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_ask_insights_by_token(VARCHAR);

CREATE OR REPLACE FUNCTION public.get_ask_insights_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  insight_id UUID,
  content TEXT,
  summary TEXT,
  status VARCHAR(50),
  challenge_id UUID,
  category VARCHAR,  -- Fixed: VARCHAR to match insights.category (not TEXT)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  insight_type_name VARCHAR(255)  -- Fixed: VARCHAR to match insight_types.name
) AS $$
DECLARE
  v_ask_session_id UUID;
BEGIN
  -- Get ASK session ID from token
  SELECT ap.ask_session_id INTO v_ask_session_id
  FROM public.ask_participants ap
  WHERE ap.invite_token = p_token
  LIMIT 1;
  
  IF v_ask_session_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    i.id,
    i.content,
    i.summary,
    i.status,
    i.challenge_id,
    i.category,
    i.created_at,
    i.updated_at,
    it.name
  FROM public.insights i
  LEFT JOIN public.insight_types it ON it.id = i.insight_type_id
  WHERE i.ask_session_id = v_ask_session_id
  ORDER BY i.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.get_participant_by_token(VARCHAR) IS 
  'Returns participant information for a valid invite token. Fixed return types to match table schema (migration 068).';

COMMENT ON FUNCTION public.get_ask_participants_by_token(VARCHAR) IS 
  'Returns all participants for an ASK session identified by a valid invite token. Fixed return types to match table schema (migration 068).';

COMMENT ON FUNCTION public.get_ask_context_by_token(VARCHAR) IS 
  'Returns project and challenge information for an ASK session identified by a valid invite token. Fixed return types to match table schema (migration 068).';

COMMENT ON FUNCTION public.get_ask_insights_by_token(VARCHAR) IS 
  'Returns insights for an ASK session identified by invite token, including category metadata. Fixed return types to match table schema (migration 068).';

COMMIT;

