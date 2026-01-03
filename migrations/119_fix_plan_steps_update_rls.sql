-- Migration: Fix UPDATE RLS policy for ask_conversation_plan_steps
-- Purpose: Allow participants to update step elapsed time (for timer sync)
--
-- ISSUE: Timer updates fail because the UPDATE policy only checks:
-- - a.created_by = auth.uid() (session owner)
-- - ct.user_id = auth.uid() (thread owner)
--
-- Participants should also be able to update step elapsed time.
--
-- NOTE: The service_role client should bypass RLS anyway, but this adds defense in depth.

-- Drop and recreate the UPDATE policy for authenticated users
DROP POLICY IF EXISTS "Users can update plan steps if they can edit the session" ON ask_conversation_plan_steps;

CREATE POLICY "Users can update plan steps if they can edit the session"
ON ask_conversation_plan_steps
FOR UPDATE
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

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
