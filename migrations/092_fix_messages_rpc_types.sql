-- Migration 092: Fix get_messages_for_thread RPC function type mismatches
-- The messages table uses VARCHAR for some columns, but the RPC expects TEXT
-- This migration casts the columns to ensure type compatibility

BEGIN;

-- Drop and recreate the function with proper type casting
DROP FUNCTION IF EXISTS public.get_messages_for_thread(uuid);

CREATE OR REPLACE FUNCTION public.get_messages_for_thread(p_thread_id uuid)
RETURNS TABLE (
  message_id uuid,
  ask_session_id uuid,
  user_id uuid,
  sender_type text,
  content text,
  message_type text,
  metadata jsonb,
  created_at timestamptz,
  conversation_thread_id uuid,
  plan_step_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id as message_id,
    m.ask_session_id,
    m.user_id,
    m.sender_type::text,
    m.content::text,
    m.message_type::text,
    m.metadata,
    m.created_at,
    m.conversation_thread_id,
    m.plan_step_id::text
  FROM messages m
  WHERE m.conversation_thread_id = p_thread_id
  ORDER BY m.created_at ASC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_messages_for_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_messages_for_thread(uuid) TO anon;

COMMIT;
