-- Migration 060: Fix permissions for ask_conversation_plan_steps
-- Add missing GRANT statements that were present in ask_conversation_plans

BEGIN;

-- Grant table-level permissions (required before RLS policies can work)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_conversation_plan_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_conversation_plan_steps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_conversation_plan_steps TO anon;

COMMIT;

-- //@UNDO
BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ask_conversation_plan_steps FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ask_conversation_plan_steps FROM service_role;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ask_conversation_plan_steps FROM anon;

COMMIT;
