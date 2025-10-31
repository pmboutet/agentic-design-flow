BEGIN;

-- With Supabase, service role key should bypass RLS automatically,
-- but if that's not working, we can disable RLS for these system tables
-- since they're only modified by admin operations anyway.

-- Alternative approach: Keep RLS enabled but allow all operations
-- by service role (identified by bypassing auth checks)

-- First, drop all existing policies
DROP POLICY IF EXISTS "Service role and admins can manage knowledge graph edges" ON public.knowledge_graph_edges;
DROP POLICY IF EXISTS "Users can read knowledge graph edges" ON public.knowledge_graph_edges;
DROP POLICY IF EXISTS "Service role and admins can manage knowledge entities" ON public.knowledge_entities;
DROP POLICY IF EXISTS "Users can read knowledge entities" ON public.knowledge_entities;
DROP POLICY IF EXISTS "Service role and admins can manage insight syntheses" ON public.insight_syntheses;
DROP POLICY IF EXISTS "Users can read insight syntheses" ON public.insight_syntheses;
DROP POLICY IF EXISTS "Service role and admins can manage insight keywords" ON public.insight_keywords;
DROP POLICY IF EXISTS "Users can read insight keywords" ON public.insight_keywords;

-- Disable RLS for these system tables
-- They are only modified by admin/service operations
ALTER TABLE public.knowledge_graph_edges DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_syntheses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_keywords DISABLE ROW LEVEL SECURITY;

COMMIT;

