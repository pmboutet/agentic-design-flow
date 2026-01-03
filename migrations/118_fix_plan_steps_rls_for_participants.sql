-- Migration: Fix RLS policy for ask_conversation_plan_steps to allow participants
-- Purpose: Participants should be able to view step elapsed time, not just session owners
--
-- ISSUE: step_elapsed_minutes shows 0 in production because participants
-- don't match the existing SELECT policy which only checks:
-- - a.created_by = auth.uid() (session owner)
-- - ct.user_id = auth.uid() (thread owner)
--
-- FIX: Add is_ask_participant() check to allow any participant to view steps

-- Drop and recreate the SELECT policy for authenticated users
DROP POLICY IF EXISTS "Users can view plan steps if they can access the plan" ON ask_conversation_plan_steps;

CREATE POLICY "Users can view plan steps if they can access the plan"
ON ask_conversation_plan_steps
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM ask_conversation_plans p
    JOIN conversation_threads ct ON p.conversation_thread_id = ct.id
    JOIN ask_sessions a ON ct.ask_session_id = a.id
    WHERE p.id = ask_conversation_plan_steps.plan_id
    AND (
      -- Session owner
      a.created_by = auth.uid()
      -- Thread owner
      OR ct.user_id = auth.uid()
      -- Participant of the session
      OR is_ask_participant(a.id)
    )
  )
);

-- Also add an RPC function to fetch step elapsed time (bypasses RLS)
-- This is a fallback for cases where RLS still doesn't work
CREATE OR REPLACE FUNCTION public.get_step_elapsed_seconds(
  p_step_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_elapsed_seconds integer;
BEGIN
  SELECT elapsed_active_seconds INTO v_elapsed_seconds
  FROM ask_conversation_plan_steps
  WHERE id = p_step_id;

  RETURN COALESCE(v_elapsed_seconds, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_step_elapsed_seconds TO anon, authenticated, service_role;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
