BEGIN;

-- Grant explicit permissions to service_role for ask_prompt_templates table
-- This ensures the service role can access the table even with RLS enabled
-- The service role should bypass RLS, but explicit grants ensure compatibility

-- Grant all permissions on ask_prompt_templates to service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_prompt_templates TO service_role;

-- Also ensure authenticated role has all permissions (already granted but ensure it's complete)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_prompt_templates TO authenticated;

COMMIT;

-- //@UNDO
BEGIN;

-- Revoke service_role permissions (keep authenticated as it was originally)
REVOKE ALL ON public.ask_prompt_templates FROM service_role;

COMMIT;






