-- Migration 096: Fix all RPC function conflicts and RLS issues
-- Consolidates fixes for get_participant_by_token, get_ask_session_by_key, and conversation_threads

BEGIN;

-- ============================================================
-- 1. Fix get_participant_by_token function overloading
-- ============================================================
-- Drop all versions and recreate with text type only
DROP FUNCTION IF EXISTS public.get_participant_by_token(text);
DROP FUNCTION IF EXISTS public.get_participant_by_token(character varying);

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
    ap.participant_email::text,
    ap.participant_name::text,
    ap.invite_token::text,
    ap.role::text,
    ap.is_spokesperson,
    ap.elapsed_active_seconds
  FROM ask_participants ap
  WHERE ap.invite_token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_participant_by_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_participant_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_participant_by_token(text) TO service_role;

-- ============================================================
-- 2. Create get_ask_session_by_key function
-- ============================================================
DROP FUNCTION IF EXISTS public.get_ask_session_by_key(text);

CREATE OR REPLACE FUNCTION public.get_ask_session_by_key(p_key text)
RETURNS TABLE (
  ask_session_id uuid,
  ask_key text,
  question text,
  description text,
  status text,
  project_id uuid,
  challenge_id uuid,
  conversation_mode text,
  expected_duration_minutes integer,
  system_prompt text,
  is_anonymous boolean,
  name text,
  delivery_mode text,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id as ask_session_id,
    a.ask_key::text,
    a.question::text,
    a.description::text,
    a.status::text,
    a.project_id,
    a.challenge_id,
    a.conversation_mode::text,
    a.expected_duration_minutes,
    a.system_prompt::text,
    a.is_anonymous,
    a.name::text,
    a.delivery_mode::text,
    a.start_date,
    a.end_date,
    a.created_at,
    a.updated_at
  FROM ask_sessions a
  WHERE a.ask_key = p_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ask_session_by_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ask_session_by_key(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ask_session_by_key(text) TO service_role;

-- ============================================================
-- 3. Disable RLS on conversation_threads (simplest fix)
-- ============================================================
ALTER TABLE public.conversation_threads DISABLE ROW LEVEL SECURITY;

-- Grant full access to all roles
GRANT ALL ON public.conversation_threads TO service_role;
GRANT ALL ON public.conversation_threads TO authenticated;
GRANT SELECT, INSERT ON public.conversation_threads TO anon;

-- ============================================================
-- 4. Also disable RLS on conversation_plans and conversation_plan_steps
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversation_plans') THEN
    ALTER TABLE public.conversation_plans DISABLE ROW LEVEL SECURITY;
    GRANT ALL ON public.conversation_plans TO service_role;
    GRANT ALL ON public.conversation_plans TO authenticated;
    RAISE NOTICE 'Disabled RLS on conversation_plans';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversation_plan_steps') THEN
    ALTER TABLE public.conversation_plan_steps DISABLE ROW LEVEL SECURITY;
    GRANT ALL ON public.conversation_plan_steps TO service_role;
    GRANT ALL ON public.conversation_plan_steps TO authenticated;
    RAISE NOTICE 'Disabled RLS on conversation_plan_steps';
  END IF;
END $$;

COMMIT;
