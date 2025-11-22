-- Migration 055: Fix conversation_threads permissions for service role
-- The conversation_threads table was created in migration 040 but may not have
-- explicit grants for service_role, which is needed for admin operations in dev bypass mode

BEGIN;

-- Grant explicit permissions to service_role for conversation_threads table
-- This allows the admin client (using service role key) to bypass RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_threads TO service_role;

-- If RLS is enabled on conversation_threads, create a policy that allows service_role
-- Service role is identified by auth.role() = 'service_role'
DO $$
BEGIN
  -- Check if RLS is enabled
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'conversation_threads'
    AND rowsecurity = true
  ) THEN
    -- Drop existing policy if it exists
    DROP POLICY IF EXISTS "Service role can manage conversation threads" ON public.conversation_threads;
    
    -- Create policy for service role
    CREATE POLICY "Service role can manage conversation threads"
      ON public.conversation_threads FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;






