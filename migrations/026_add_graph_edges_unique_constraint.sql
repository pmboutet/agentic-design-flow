BEGIN;

-- Add unique constraint to prevent duplicate edges
-- This allows upsert operations to work correctly
ALTER TABLE public.knowledge_graph_edges
  ADD CONSTRAINT knowledge_graph_edges_unique_edge
  UNIQUE (source_id, source_type, target_id, target_type, relationship_type);

COMMIT;

