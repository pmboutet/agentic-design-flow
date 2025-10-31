BEGIN;

-- Add graph_rag_scope column to projects table
-- 'project' (default): similarity analysis only within the same project
-- 'client': similarity analysis across all projects of the same client (requires admin permissions)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS graph_rag_scope VARCHAR(20) DEFAULT 'project' NOT NULL;

-- Add constraint to ensure valid values
ALTER TABLE public.projects
  ADD CONSTRAINT graph_rag_scope_check 
  CHECK (graph_rag_scope IN ('project', 'client'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_graph_rag_scope 
  ON public.projects(graph_rag_scope);

COMMENT ON COLUMN public.projects.graph_rag_scope IS 
  'Scope for Graph RAG similarity analysis: "project" (default) limits to same project, "client" includes all projects of same client (admin only)';

COMMIT;

