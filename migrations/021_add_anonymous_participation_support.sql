-- Migration: Add anonymous participation support for ask sessions
-- This allows any logged-in user to participate in ask sessions when is_anonymous is true

-- Update the is_ask_participant function to check if the session allows anonymous participation
CREATE OR REPLACE FUNCTION public.is_ask_participant(ask_session_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  session_is_anonymous BOOLEAN;
BEGIN
  -- Check if the session allows anonymous participation
  SELECT is_anonymous INTO session_is_anonymous
  FROM public.ask_sessions
  WHERE id = ask_session_uuid;
  
  -- If session allows anonymous participation, any logged-in user can participate
  IF session_is_anonymous = true AND public.current_user_id() IS NOT NULL THEN
    RETURN true;
  END IF;
  
  -- Otherwise, check if user is explicitly a participant
  RETURN EXISTS (
    SELECT 1 
    FROM public.ask_participants 
    WHERE ask_session_id = ask_session_uuid 
    AND user_id = public.current_user_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.is_ask_participant(UUID) IS 
  'Returns true if the current user can participate in the ask session. 
   Returns true automatically for anonymous sessions (is_anonymous=true) if user is logged in.
   Otherwise checks if user is in ask_participants table.';

