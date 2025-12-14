-- Migration 086: Fix service_role permissions for all ASK-related tables
-- The admin client uses service_role key but was getting permission denied errors
-- This migration ensures service_role can access all necessary tables

BEGIN;

-- ============================================================================
-- GRANT permissions to service_role for all ASK-related tables
-- Only grant on tables that exist (use DO block to handle missing tables gracefully)
-- ============================================================================

DO $$
BEGIN
  -- conversation_threads - needed for thread management
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversation_threads') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_threads TO service_role';
    RAISE NOTICE 'Granted permissions on conversation_threads';
  END IF;

  -- ask_sessions - needed for session lookup
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ask_sessions') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_sessions TO service_role';
    RAISE NOTICE 'Granted permissions on ask_sessions';
  END IF;

  -- ask_participants - needed for participant lookup by token
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ask_participants') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_participants TO service_role';
    RAISE NOTICE 'Granted permissions on ask_participants';
  END IF;

  -- messages - needed for message operations
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO service_role';
    RAISE NOTICE 'Granted permissions on messages';
  END IF;

  -- insights - needed for insight operations
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'insights') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights TO service_role';
    RAISE NOTICE 'Granted permissions on insights';
  END IF;

  -- profiles - needed for user lookup
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    EXECUTE 'GRANT SELECT ON public.profiles TO service_role';
    RAISE NOTICE 'Granted permissions on profiles';
  END IF;
END $$;

-- ============================================================================
-- Create permissive RLS policies for service_role
-- These policies allow service_role to bypass RLS on tables where it's enabled
-- ============================================================================

DO $$
DECLARE
  table_record RECORD;
BEGIN
  -- Loop through tables that might have RLS enabled
  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('conversation_threads', 'ask_sessions', 'ask_participants', 'messages', 'insights', 'profiles')
  LOOP
    -- Check if RLS is enabled on this table
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename = table_record.tablename
      AND rowsecurity = true
    ) THEN
      -- Drop existing service role policy if exists
      EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I', table_record.tablename);

      -- Create permissive policy for service_role
      -- Using (true) allows all operations for service_role
      EXECUTE format('CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_record.tablename);

      RAISE NOTICE 'Created service_role policy for table: %', table_record.tablename;
    ELSE
      RAISE NOTICE 'RLS not enabled on table: %, skipping policy creation', table_record.tablename;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Verify permissions were granted
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 086 completed: service_role permissions granted for ASK-related tables';
END $$;

COMMIT;
