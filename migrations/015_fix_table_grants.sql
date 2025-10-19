-- Migration 015: Fix table GRANTS for RLS to work properly
-- RLS policies can only filter data if the role has basic table permissions

-- Grant permissions to authenticated users (anon role is used by default)
-- These grants are filtered by RLS policies

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Core tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

-- Insight tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_authors TO authenticated;
GRANT SELECT ON public.insight_types TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.insight_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_foundation_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_estimations TO authenticated;

-- AI tables
GRANT SELECT ON public.ai_model_configs TO authenticated;
GRANT SELECT ON public.ai_agents TO authenticated;
GRANT SELECT ON public.ai_agent_logs TO authenticated;
GRANT SELECT ON public.ai_insight_jobs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_model_configs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_agent_logs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_insight_jobs TO authenticated;

-- Documents
GRANT SELECT ON public.documents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.documents TO authenticated;

-- Grant sequence usage for auto-increment IDs
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Important: Ensure service_role still has full access (it should bypass RLS anyway)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMENT ON SCHEMA public IS 
  'Standard public schema with RLS enabled. Authenticated users have basic GRANT permissions filtered by RLS policies.';

