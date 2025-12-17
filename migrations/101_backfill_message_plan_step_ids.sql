-- Migration 101: Backfill plan_step_id for existing messages
-- Messages should always have a plan_step_id when there's a conversation plan
-- This migration assigns messages without plan_step_id to the appropriate step

BEGIN;

-- Step 1: For messages without plan_step_id, find the step that was active
-- when the message was created based on step activation times
-- If a message was created before any step was activated, assign to first step
-- If a message was created after a step was activated but before the next, assign to that step

-- Create a temporary function to find the correct step for a message
CREATE OR REPLACE FUNCTION temp_find_step_for_message(
  p_thread_id uuid,
  p_message_created_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_step_id uuid;
  v_plan_id uuid;
BEGIN
  -- Find the conversation plan for this thread
  SELECT id INTO v_plan_id
  FROM ask_conversation_plans
  WHERE conversation_thread_id = p_thread_id
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Find the step that was active at the time the message was created
  -- This is the most recently activated step that was activated before the message
  SELECT id INTO v_step_id
  FROM ask_conversation_plan_steps
  WHERE plan_id = v_plan_id
    AND activated_at IS NOT NULL
    AND activated_at <= p_message_created_at
  ORDER BY activated_at DESC
  LIMIT 1;

  -- If no step was activated yet, use the first step (by step_order)
  IF v_step_id IS NULL THEN
    SELECT id INTO v_step_id
    FROM ask_conversation_plan_steps
    WHERE plan_id = v_plan_id
    ORDER BY step_order ASC
    LIMIT 1;
  END IF;

  RETURN v_step_id;
END;
$$;

-- Step 2: Update messages that have a thread but no plan_step_id
UPDATE messages m
SET plan_step_id = temp_find_step_for_message(m.conversation_thread_id, m.created_at)
WHERE m.plan_step_id IS NULL
  AND m.conversation_thread_id IS NOT NULL
  AND temp_find_step_for_message(m.conversation_thread_id, m.created_at) IS NOT NULL;

-- Step 3: For messages without a thread, try to find via ask_session_id
-- First, find the shared thread for the session, then find the step
UPDATE messages m
SET plan_step_id = (
  SELECT temp_find_step_for_message(ct.id, m.created_at)
  FROM conversation_threads ct
  WHERE ct.ask_session_id = m.ask_session_id
    AND ct.is_shared = true
  LIMIT 1
)
WHERE m.plan_step_id IS NULL
  AND m.conversation_thread_id IS NULL
  AND m.ask_session_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM conversation_threads ct
    WHERE ct.ask_session_id = m.ask_session_id
      AND ct.is_shared = true
  );

-- Step 4: Drop the temporary function
DROP FUNCTION IF EXISTS temp_find_step_for_message(uuid, timestamptz);

-- Log how many messages were updated
DO $$
DECLARE
  updated_count integer;
  remaining_count integer;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM messages
  WHERE plan_step_id IS NULL
    AND (conversation_thread_id IS NOT NULL OR ask_session_id IS NOT NULL);

  RAISE NOTICE 'Messages still without plan_step_id (with thread or ask_session): %', remaining_count;
END;
$$;

COMMIT;
