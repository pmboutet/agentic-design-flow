BEGIN;

-- Grant explicit permissions to authenticated role (used by Supabase service role)
-- This ensures that even with RLS disabled, the service role can write to these tables

-- Grant all permissions on knowledge_graph_edges
GRANT ALL ON public.knowledge_graph_edges TO authenticated;
GRANT ALL ON public.knowledge_graph_edges TO service_role;
GRANT ALL ON public.knowledge_graph_edges TO anon;
GRANT ALL ON public.knowledge_graph_edges TO postgres;

-- Grant all permissions on knowledge_entities
GRANT ALL ON public.knowledge_entities TO authenticated;
GRANT ALL ON public.knowledge_entities TO service_role;
GRANT ALL ON public.knowledge_entities TO anon;
GRANT ALL ON public.knowledge_entities TO postgres;

-- Grant all permissions on insight_syntheses
GRANT ALL ON public.insight_syntheses TO authenticated;
GRANT ALL ON public.insight_syntheses TO service_role;
GRANT ALL ON public.insight_syntheses TO anon;
GRANT ALL ON public.insight_syntheses TO postgres;

-- Grant all permissions on insight_keywords
GRANT ALL ON public.insight_keywords TO authenticated;
GRANT ALL ON public.insight_keywords TO service_role;
GRANT ALL ON public.insight_keywords TO anon;
GRANT ALL ON public.insight_keywords TO postgres;

-- Also grant usage on the schema (might be needed)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon;

-- Make sure RLS is disabled (in case it was re-enabled)
ALTER TABLE public.knowledge_graph_edges DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_syntheses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_keywords DISABLE ROW LEVEL SECURITY;

COMMIT;

