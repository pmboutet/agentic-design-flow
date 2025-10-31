BEGIN;

-- ============================================================================
-- FIX: Infinite recursion in insights and insight_authors RLS policies
-- ============================================================================
-- 
-- Problem: Circular dependency between policies:
-- 1. Policy "Users can view their authored insights" on insights table 
--    queries insight_authors table
-- 2. Policy "Users can view insight authors in their sessions" on insight_authors 
--    queries insights table
-- This creates infinite recursion.
--
-- Solution: Use SECURITY DEFINER functions to bypass RLS when checking 
-- cross-table relationships.

-- ============================================================================
-- STEP 1: Create helper functions with SECURITY DEFINER to bypass RLS
-- ============================================================================

-- Function to check if user authored an insight (bypasses RLS)
CREATE OR REPLACE FUNCTION public.check_user_authored_insight(insight_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.insight_authors
    WHERE insight_id = insight_uuid
    AND user_id = public.current_user_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if an insight belongs to a session the user participates in (bypasses RLS)
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

-- ============================================================================
-- STEP 2: Fix insight_authors policies
-- ============================================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view insight authors in their sessions" ON public.insight_authors;

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

-- ============================================================================
-- STEP 3: Fix insights policies
-- ============================================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view their authored insights" ON public.insights;

-- Recreate the policy using the security definer function to avoid recursion
CREATE POLICY "Users can view their authored insights"
  ON public.insights FOR SELECT
  USING (
    -- Use security definer function to check authorship without triggering RLS on insight_authors
    public.check_user_authored_insight(id)
  );

COMMIT;

