-- Migration: Fix function return types to match table schema
-- The RETURNS TABLE must match the actual column types in ask_sessions table

BEGIN;

-- ============================================================================
-- FUNCTION: Get ASK session data by token (FIXED - return types)
-- ============================================================================
-- Fix: Change name from TEXT to VARCHAR to match ask_sessions.name column type
-- Note: Must DROP first because we're changing the return type
DROP FUNCTION IF EXISTS public.get_ask_session_by_token(VARCHAR);

CREATE OR REPLACE FUNCTION public.get_ask_session_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  ask_session_id UUID,
  ask_key VARCHAR(255),
  name VARCHAR,  -- Changed from TEXT to VARCHAR to match table schema
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
  -- Fix: Qualify ask_session_id with table name to avoid ambiguity with RETURNS TABLE column
  SELECT ap.id, ap.ask_session_id INTO v_participant_id, v_ask_session_id
  FROM public.ask_participants ap
  WHERE ap.invite_token = p_token
  LIMIT 1;
  
  -- If token not found, return empty result
  IF v_participant_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Return ASK session data (bypasses RLS due to SECURITY DEFINER)
  -- Fix: Use explicit alias to avoid ambiguity
  RETURN QUERY
  SELECT 
    a.id AS ask_session_id,
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
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.get_ask_session_by_token(VARCHAR) IS 
  'Returns ASK session data for a valid invite token. Fixed ambiguous column reference and return type mismatch.';

COMMIT;

