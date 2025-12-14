-- Migration 093: Add service_role access to ai_agent_logs table
-- This table was missing from the previous service_role access migrations

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_agent_logs') THEN
    -- Enable RLS
    ALTER TABLE public.ai_agent_logs ENABLE ROW LEVEL SECURITY;

    -- Drop existing policy if exists
    DROP POLICY IF EXISTS "Service role full access" ON public.ai_agent_logs;

    -- Create permissive policy for service_role
    CREATE POLICY "Service role full access" ON public.ai_agent_logs
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    -- Grant all permissions
    GRANT ALL ON public.ai_agent_logs TO service_role;

    RAISE NOTICE 'Granted service_role access on ai_agent_logs';
  ELSE
    RAISE NOTICE 'Table ai_agent_logs does not exist, skipping';
  END IF;
END $$;

COMMIT;
