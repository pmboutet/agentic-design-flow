-- Migration 082: Fix get_ask_session_by_token to return conversation_mode
-- The function was still returning the deprecated audience_scope and response_mode columns
-- instead of the new conversation_mode column added in migration 063

BEGIN;

-- Drop the existing function to recreate with new return type
DROP FUNCTION IF EXISTS public.get_ask_session_by_token(VARCHAR);

-- Recreate function with conversation_mode instead of audience_scope/response_mode
CREATE OR REPLACE FUNCTION public.get_ask_session_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  ask_session_id UUID,
  ask_key VARCHAR(255),
  name VARCHAR,
  question TEXT,
  description TEXT,
  status VARCHAR(50),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_anonymous BOOLEAN,
  max_participants INTEGER,
  delivery_mode VARCHAR(50),
  conversation_mode VARCHAR(30),  -- Replaces audience_scope and response_mode
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
  SELECT ap.id, ap.ask_session_id INTO v_participant_id, v_ask_session_id
  FROM public.ask_participants ap
  WHERE ap.invite_token = p_token
  LIMIT 1;

  -- If token not found, return empty result
  IF v_participant_id IS NULL THEN
    RETURN;
  END IF;

  -- Return ASK session data (bypasses RLS due to SECURITY DEFINER)
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
    a.conversation_mode,  -- Now returns the correct column
    a.project_id,
    a.challenge_id,
    a.created_by,
    a.created_at,
    a.updated_at
  FROM public.ask_sessions a
  WHERE a.id = v_ask_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_ask_session_by_token(VARCHAR) IS
  'Returns ASK session data for a valid invite token. Now includes conversation_mode (individual_parallel, collaborative, group_reporter, consultant).';

COMMIT;
