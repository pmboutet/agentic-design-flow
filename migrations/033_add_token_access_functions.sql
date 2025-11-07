-- Migration: Add secure token-based access functions
-- This migration creates SECURITY DEFINER functions that allow controlled
-- access to ASK session data via invite tokens, while maintaining RLS security.
--
-- These functions bypass RLS but only return data for verified tokens,
-- providing a more secure alternative to using service role directly.

BEGIN;

-- ============================================================================
-- FUNCTION: Get ASK session data by token
-- ============================================================================
-- Returns ASK session information for a valid invite token.
-- Only returns data if the token exists and is valid.
CREATE OR REPLACE FUNCTION public.get_ask_session_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  ask_session_id UUID,
  ask_key VARCHAR(255),
  name TEXT,
  question TEXT,
  description TEXT,
  status VARCHAR(50),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_anonymous BOOLEAN,
  max_participants INTEGER,
  delivery_mode VARCHAR(50),
  audience_scope VARCHAR(50),
  response_mode VARCHAR(50),
  project_id UUID,
  challenge_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_participant_id UUID;
  v_ask_session_id UUID;
BEGIN
  -- First, verify token exists and get participant
  SELECT id, ask_session_id INTO v_participant_id, v_ask_session_id
  FROM public.ask_participants
  WHERE invite_token = p_token
  LIMIT 1;
  
  -- If token not found, return empty result
  IF v_participant_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Return ASK session data (bypasses RLS due to SECURITY DEFINER)
  RETURN QUERY
  SELECT 
    a.id,
    a.ask_key,
    a.name,
    a.question,
    a.description,
    a.status,
    a.start_date,
    a.end_date,
    a.is_anonymous,
    a.max_participants,
    a.delivery_mode,
    a.audience_scope,
    a.response_mode,
    a.project_id,
    a.challenge_id,
    a.created_by,
    a.created_at,
    a.updated_at
  FROM public.ask_sessions a
  WHERE a.id = v_ask_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get participant info by token
-- ============================================================================
-- Returns the participant information associated with a token.
CREATE OR REPLACE FUNCTION public.get_participant_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  participant_id UUID,
  user_id UUID,
  participant_name TEXT,
  participant_email TEXT,
  role TEXT,
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
-- FUNCTION: Get participants for an ASK session (with token verification)
-- ============================================================================
-- Returns all participants for an ASK session, but only if the provided
-- token is valid for that session.
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
  SELECT ask_session_id INTO v_ask_session_id
  FROM public.ask_participants
  WHERE invite_token = p_token
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
-- FUNCTION: Get messages for an ASK session (with token verification)
-- ============================================================================
-- Returns messages for an ASK session identified by a valid invite token.
CREATE OR REPLACE FUNCTION public.get_ask_messages_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  message_id UUID,
  content TEXT,
  type VARCHAR(50),
  sender_type VARCHAR(50),
  sender_id UUID,
  sender_name TEXT,
  created_at TIMESTAMPTZ,
  metadata JSONB
) AS $$
DECLARE
  v_ask_session_id UUID;
BEGIN
  -- Get ASK session ID from token
  SELECT ask_session_id INTO v_ask_session_id
  FROM public.ask_participants
  WHERE invite_token = p_token
  LIMIT 1;
  
  IF v_ask_session_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.type,
    m.sender_type,
    m.sender_id,
    m.sender_name,
    m.created_at,
    m.metadata
  FROM public.messages m
  WHERE m.ask_session_id = v_ask_session_id
  ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get insights for an ASK session (with token verification)
-- ============================================================================
-- Returns insights for an ASK session identified by a valid invite token.
CREATE OR REPLACE FUNCTION public.get_ask_insights_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  insight_id UUID,
  content TEXT,
  summary TEXT,
  status VARCHAR(50),
  challenge_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  insight_type_name VARCHAR(255)
) AS $$
DECLARE
  v_ask_session_id UUID;
BEGIN
  -- Get ASK session ID from token
  SELECT ask_session_id INTO v_ask_session_id
  FROM public.ask_participants
  WHERE invite_token = p_token
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
-- FUNCTION: Get project and challenge info by token
-- ============================================================================
-- Returns project and challenge information for an ASK session.
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
  SELECT ask_session_id INTO v_ask_session_id
  FROM public.ask_participants
  WHERE invite_token = p_token
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

COMMENT ON FUNCTION public.get_ask_session_by_token(VARCHAR) IS 
  'Returns ASK session data for a valid invite token. Bypasses RLS but only for verified tokens.';

COMMENT ON FUNCTION public.get_participant_by_token(VARCHAR) IS 
  'Returns participant information for a valid invite token.';

COMMENT ON FUNCTION public.get_ask_participants_by_token(VARCHAR) IS 
  'Returns all participants for an ASK session identified by a valid invite token.';

COMMENT ON FUNCTION public.get_ask_messages_by_token(VARCHAR) IS 
  'Returns messages for an ASK session identified by a valid invite token.';

COMMENT ON FUNCTION public.get_ask_insights_by_token(VARCHAR) IS 
  'Returns insights for an ASK session identified by a valid invite token.';

COMMENT ON FUNCTION public.get_ask_context_by_token(VARCHAR) IS 
  'Returns project and challenge information for an ASK session identified by a valid invite token.';

COMMIT;

