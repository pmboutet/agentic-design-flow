-- Migration 089: Force service_role access on all ASK-related tables
-- This migration unconditionally grants access without checking RLS status
-- Uses DO blocks to safely handle tables that may not exist

BEGIN;

-- Helper function to grant service_role access
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'conversation_threads',
    'ask_sessions',
    'ask_participants',
    'messages',
    'insights',
    'profiles',
    'projects',
    'challenges',
    'agents',
    'ai_agent_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      -- Enable RLS
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      -- Drop existing policy if exists
      EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I', tbl);

      -- Create permissive policy for service_role
      EXECUTE format('CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl);

      -- Grant all permissions
      EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);

      RAISE NOTICE 'Granted service_role access on %', tbl;
    ELSE
      RAISE NOTICE 'Table % does not exist, skipping', tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;
