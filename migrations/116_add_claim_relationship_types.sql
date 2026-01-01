-- Migration: Add claim relationship types to knowledge_graph_edges constraint
-- This migration adds the claim-related relationship types that were missing

-- Drop the old constraint
ALTER TABLE knowledge_graph_edges DROP CONSTRAINT IF EXISTS valid_relationship_types;

-- Add updated constraint with claim relationship types
ALTER TABLE knowledge_graph_edges ADD CONSTRAINT valid_relationship_types
CHECK (relationship_type IN (
  'SIMILAR_TO',
  'RELATED_TO',
  'CONTAINS',
  'SYNTHESIZES',
  'MENTIONS',
  'EVIDENCE_FOR',
  'SUPPORTS',
  'CONTRADICTS',
  'ADDRESSES'
));

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
