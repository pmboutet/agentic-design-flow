-- Migration 094: Disable RLS on ai_agent_logs
-- This table is only used internally for logging AI agent interactions.
-- It doesn't contain user-specific data that needs row-level protection.
-- Disabling RLS simplifies access and avoids service_role bypass issues.

BEGIN;

-- Disable RLS on ai_agent_logs
ALTER TABLE public.ai_agent_logs DISABLE ROW LEVEL SECURITY;

-- Also disable on related AI tables that are internal
ALTER TABLE public.ai_insight_jobs DISABLE ROW LEVEL SECURITY;

-- Grant full access to service_role (belt and suspenders)
GRANT ALL ON public.ai_agent_logs TO service_role;
GRANT ALL ON public.ai_insight_jobs TO service_role;

-- Also grant to authenticated for any API routes that need it
GRANT SELECT, INSERT ON public.ai_agent_logs TO authenticated;
GRANT SELECT, INSERT ON public.ai_insight_jobs TO authenticated;

COMMIT;
