-- Migration: Fix token access functions
-- Fixes ambiguous column reference and incorrect column names

BEGIN;

-- ============================================================================
-- FUNCTION: Get ASK session data by token (FIXED)
-- ============================================================================
-- Fix: Use explicit alias to avoid ambiguity with ask_session_id
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
  -- Fix: Use explicit alias 'session_id' to avoid ambiguity
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
-- FUNCTION: Get messages for an ASK session (FIXED)
-- ============================================================================
-- Fix: Use message_type instead of type, and derive sender_id/sender_name from user_id
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
  
  -- Return messages with sender info derived from user_id
  -- Fix: Use message_type instead of type
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
  WHERE m.ask_session_id = v_ask_session_id
  ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.get_ask_session_by_token(VARCHAR) IS 
  'Returns ASK session data for a valid invite token. Fixed ambiguous column reference.';

COMMENT ON FUNCTION public.get_ask_messages_by_token(VARCHAR) IS 
  'Returns messages for an ASK session identified by a valid invite token. Fixed to use message_type and derive sender info.';

COMMIT;

