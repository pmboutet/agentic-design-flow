-- Migration 071: Add service_role RLS policies to AI tables
--
-- Problem: The ai_agents, ai_model_configs, and ai_agent_logs tables have RLS enabled
-- but no explicit service_role policy. While service_role should bypass RLS automatically
-- in Supabase, adding explicit policies ensures consistent behavior across environments.
--
-- This fixes conversation plan generation failing in production while working in development.

BEGIN;

-- ============================================================
-- Add service_role policies for ai_agents table
-- ============================================================

-- Drop existing service_role policy if it exists (for idempotency)
DROP POLICY IF EXISTS "Service role has full access to ai agents" ON public.ai_agents;

-- Create service_role policy for full access
CREATE POLICY "Service role has full access to ai agents"
  ON public.ai_agents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also ensure authenticated users can read ai_agents (for API routes)
DROP POLICY IF EXISTS "Authenticated users can view ai agents" ON public.ai_agents;

CREATE POLICY "Authenticated users can view ai agents"
  ON public.ai_agents
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Add service_role policies for ai_model_configs table
-- ============================================================

-- Drop existing service_role policy if it exists
DROP POLICY IF EXISTS "Service role has full access to ai model configs" ON public.ai_model_configs;

-- Create service_role policy for full access
CREATE POLICY "Service role has full access to ai model configs"
  ON public.ai_model_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also ensure authenticated users can read ai_model_configs (for API routes)
DROP POLICY IF EXISTS "Authenticated users can view ai model configs" ON public.ai_model_configs;

CREATE POLICY "Authenticated users can view ai model configs"
  ON public.ai_model_configs
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Add service_role policies for ai_agent_logs table
-- ============================================================

-- Drop existing service_role policy if it exists
DROP POLICY IF EXISTS "Service role has full access to ai agent logs" ON public.ai_agent_logs;

-- Create service_role policy for full access
CREATE POLICY "Service role has full access to ai agent logs"
  ON public.ai_agent_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Add service_role policies for ai_insight_jobs table
-- ============================================================

-- Drop existing service_role policy if it exists
DROP POLICY IF EXISTS "Service role has full access to ai insight jobs" ON public.ai_insight_jobs;

-- Create service_role policy for full access
CREATE POLICY "Service role has full access to ai insight jobs"
  ON public.ai_insight_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Grant explicit permissions (belt and suspenders)
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_model_configs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insight_jobs TO service_role;

-- Grant read permissions to authenticated users
GRANT SELECT ON public.ai_agents TO authenticated;
GRANT SELECT ON public.ai_model_configs TO authenticated;

COMMIT;

-- //@UNDO
BEGIN;

DROP POLICY IF EXISTS "Service role has full access to ai agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Authenticated users can view ai agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Service role has full access to ai model configs" ON public.ai_model_configs;
DROP POLICY IF EXISTS "Authenticated users can view ai model configs" ON public.ai_model_configs;
DROP POLICY IF EXISTS "Service role has full access to ai agent logs" ON public.ai_agent_logs;
DROP POLICY IF EXISTS "Service role has full access to ai insight jobs" ON public.ai_insight_jobs;

COMMIT;
