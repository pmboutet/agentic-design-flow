-- Migration 117: Fix RLS on ask_conversation_plans and ask_conversation_plan_steps
--
-- Bug: Migration 096 tried to disable RLS on "conversation_plans" and "conversation_plan_steps"
-- but the actual tables are named "ask_conversation_plans" and "ask_conversation_plan_steps"
-- This caused progression data to be blocked by RLS in production.

BEGIN;

-- Disable RLS on the correct tables
ALTER TABLE public.ask_conversation_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_conversation_plan_steps DISABLE ROW LEVEL SECURITY;

-- Grant full access (already have service_role policies, but ensure grants exist)
GRANT ALL ON public.ask_conversation_plans TO service_role;
GRANT ALL ON public.ask_conversation_plans TO authenticated;
GRANT SELECT ON public.ask_conversation_plans TO anon;

GRANT ALL ON public.ask_conversation_plan_steps TO service_role;
GRANT ALL ON public.ask_conversation_plan_steps TO authenticated;
GRANT SELECT ON public.ask_conversation_plan_steps TO anon;

COMMIT;
