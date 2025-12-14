-- Migration 088: Fix service_role RLS policies (corrects migration 086)
-- The previous migration checked pg_tables.rowsecurity which doesn't exist
-- This migration properly creates RLS policies for service_role on all ASK-related tables

BEGIN;

-- Drop existing policies if they exist (in case 086 partially worked)
DROP POLICY IF EXISTS "Service role full access" ON public.ask_sessions;
DROP POLICY IF EXISTS "Service role full access" ON public.ask_participants;
DROP POLICY IF EXISTS "Service role full access" ON public.conversation_threads;
DROP POLICY IF EXISTS "Service role full access" ON public.messages;
DROP POLICY IF EXISTS "Service role full access" ON public.insights;
DROP POLICY IF EXISTS "Service role full access" ON public.profiles;

-- Create permissive policies for service_role on all ASK-related tables
-- These allow the admin client (using service_role key) to bypass RLS

-- ask_sessions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ask_sessions' AND relrowsecurity = true) THEN
    CREATE POLICY "Service role full access" ON public.ask_sessions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on ask_sessions';
  END IF;
END $$;

-- ask_participants
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ask_participants' AND relrowsecurity = true) THEN
    CREATE POLICY "Service role full access" ON public.ask_participants
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on ask_participants';
  END IF;
END $$;

-- conversation_threads
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'conversation_threads' AND relrowsecurity = true) THEN
    CREATE POLICY "Service role full access" ON public.conversation_threads
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on conversation_threads';
  END IF;
END $$;

-- messages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'messages' AND relrowsecurity = true) THEN
    CREATE POLICY "Service role full access" ON public.messages
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on messages';
  END IF;
END $$;

-- insights
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'insights' AND relrowsecurity = true) THEN
    CREATE POLICY "Service role full access" ON public.insights
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on insights';
  END IF;
END $$;

-- profiles (SELECT only for lookups)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'profiles' AND relrowsecurity = true) THEN
    CREATE POLICY "Service role full access" ON public.profiles
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on profiles';
  END IF;
END $$;

-- conversation_plans
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'conversation_plans' AND relrowsecurity = true) THEN
    CREATE POLICY "Service role full access" ON public.conversation_plans
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on conversation_plans';
  END IF;
END $$;

-- conversation_plan_steps
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'conversation_plan_steps' AND relrowsecurity = true) THEN
    CREATE POLICY "Service role full access" ON public.conversation_plan_steps
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on conversation_plan_steps';
  END IF;
END $$;

COMMIT;
