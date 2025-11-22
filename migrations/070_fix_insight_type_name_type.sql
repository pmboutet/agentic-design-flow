-- Migration: Fix insight_type_name type in get_ask_insights_by_token
-- insight_types.name is TEXT, not VARCHAR(255)

BEGIN;

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
  category VARCHAR,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  insight_type_name TEXT  -- Fixed: TEXT to match insight_types.name (not VARCHAR)
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

COMMENT ON FUNCTION public.get_ask_insights_by_token(VARCHAR) IS 
  'Returns insights for an ASK session identified by invite token. Fixed insight_type_name type to TEXT (migration 070).';

COMMIT;

