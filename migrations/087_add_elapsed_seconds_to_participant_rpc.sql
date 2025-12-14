-- Migration 087: Add elapsed_active_seconds to get_participant_by_token RPC
-- This allows the timer route to get participant timer data via RPC (bypassing RLS)

BEGIN;

-- Drop and recreate the function with the new field
CREATE OR REPLACE FUNCTION public.get_participant_by_token(p_token text)
RETURNS TABLE (
  participant_id uuid,
  user_id uuid,
  participant_email text,
  participant_name text,
  invite_token text,
  role text,
  is_spokesperson boolean,
  elapsed_active_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ap.id as participant_id,
    ap.user_id,
    ap.participant_email,
    ap.participant_name,
    ap.invite_token,
    ap.role,
    ap.is_spokesperson,
    ap.elapsed_active_seconds
  FROM ask_participants ap
  WHERE ap.invite_token = p_token;
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.get_participant_by_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_participant_by_token(text) TO anon;

COMMIT;
