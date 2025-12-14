-- Migration 098: Add thread-based RLS policy for messages
-- This allows participants to view messages via their conversation_thread_id
-- which is needed for Supabase Realtime subscriptions to work properly

-- NOTE: SECURITY DEFINER functions don't work with Supabase Realtime
-- because Realtime evaluates policies in the user's context, not the function owner's
-- So we use a direct policy with auth.uid() instead

-- Create helper function (kept for non-realtime use cases)
CREATE OR REPLACE FUNCTION public.can_access_thread(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ask_session_id uuid;
  v_user_id uuid;
  v_is_shared boolean;
BEGIN
  SELECT ask_session_id, is_shared INTO v_ask_session_id, v_is_shared
  FROM conversation_threads
  WHERE id = p_thread_id;

  IF v_ask_session_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_is_shared THEN
    v_user_id := current_user_id();
    RETURN EXISTS (
      SELECT 1 FROM ask_participants
      WHERE ask_session_id = v_ask_session_id
      AND user_id = v_user_id
    );
  END IF;

  v_user_id := current_user_id();
  RETURN EXISTS (
    SELECT 1 FROM conversation_threads
    WHERE id = p_thread_id
    AND user_id = v_user_id
  );
END;
$$;

-- Drop old policy if exists
DROP POLICY IF EXISTS "Participants can view thread messages" ON messages;

-- Create policy that works with Supabase Realtime
-- Uses direct auth.uid() comparison instead of SECURITY DEFINER functions
CREATE POLICY "Realtime thread participants"
ON messages FOR SELECT
USING (
  conversation_thread_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM conversation_threads ct
    JOIN ask_participants ap ON ap.ask_session_id = ct.ask_session_id
    JOIN profiles p ON p.id = ap.user_id
    WHERE ct.id = messages.conversation_thread_id
    AND ct.is_shared = true
    AND p.auth_id = auth.uid()
  )
);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
