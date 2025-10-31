BEGIN;

-- ============================================================================
-- FIX: Infinite recursion in insight_authors RLS policies
-- ============================================================================
-- 
-- Problem: The policy "Users can view insight authors in their sessions" 
-- queries the insights table, which has a policy that queries insight_authors,
-- creating infinite recursion.
--
-- Solution: Modify the policy to avoid querying insights table by using
-- a simpler approach that checks if the user is the author OR uses a 
-- security definer function to bypass RLS when checking ask_session_id.

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view insight authors in their sessions" ON public.insight_authors;

-- Create a security definer function to check if an insight belongs to a session
-- the user participates in, without triggering RLS policies
CREATE OR REPLACE FUNCTION public.check_insight_session_access(insight_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  session_id UUID;
BEGIN
  -- Get the ask_session_id for this insight without triggering RLS
  SELECT ask_session_id INTO session_id
  FROM public.insights
  WHERE id = insight_uuid;
  
  -- If no session found, deny access
  IF session_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user is participant in this session
  RETURN public.is_ask_participant(session_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the policy using the security definer function to avoid recursion
CREATE POLICY "Users can view insight authors in their sessions"
  ON public.insight_authors FOR SELECT
  USING (
    -- Allow if user is the author
    user_id = public.current_user_id()
    OR
    -- Or if user has access to the insight's session (using security definer to avoid recursion)
    public.check_insight_session_access(insight_id)
  );

COMMIT;

