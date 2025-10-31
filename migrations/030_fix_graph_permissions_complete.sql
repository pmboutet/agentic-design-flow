BEGIN;

-- Ensure we're using the right role for grants
-- Supabase uses 'authenticated' and 'service_role' roles
-- We also need to grant to 'anon' for some operations

-- Revoke all existing permissions first to reset
REVOKE ALL ON public.knowledge_graph_edges FROM authenticated;
REVOKE ALL ON public.knowledge_graph_edges FROM service_role;
REVOKE ALL ON public.knowledge_graph_edges FROM anon;
REVOKE ALL ON public.knowledge_graph_edges FROM postgres;

REVOKE ALL ON public.knowledge_entities FROM authenticated;
REVOKE ALL ON public.knowledge_entities FROM service_role;
REVOKE ALL ON public.knowledge_entities FROM anon;
REVOKE ALL ON public.knowledge_entities FROM postgres;

REVOKE ALL ON public.insight_syntheses FROM authenticated;
REVOKE ALL ON public.insight_syntheses FROM service_role;
REVOKE ALL ON public.insight_syntheses FROM anon;
REVOKE ALL ON public.insight_syntheses FROM postgres;

REVOKE ALL ON public.insight_keywords FROM authenticated;
REVOKE ALL ON public.insight_keywords FROM service_role;
REVOKE ALL ON public.insight_keywords FROM anon;
REVOKE ALL ON public.insight_keywords FROM postgres;

-- Grant all permissions (SELECT, INSERT, UPDATE, DELETE) explicitly
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_graph_edges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_graph_edges TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_graph_edges TO anon;
GRANT ALL ON public.knowledge_graph_edges TO postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_entities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_entities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_entities TO anon;
GRANT ALL ON public.knowledge_entities TO postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_syntheses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_syntheses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_syntheses TO anon;
GRANT ALL ON public.insight_syntheses TO postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_keywords TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_keywords TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_keywords TO anon;
GRANT ALL ON public.insight_keywords TO postgres;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon;

-- Ensure RLS is disabled
ALTER TABLE public.knowledge_graph_edges DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_syntheses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_keywords DISABLE ROW LEVEL SECURITY;

-- Also grant sequence permissions (for UUID generation if needed)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

COMMIT;

