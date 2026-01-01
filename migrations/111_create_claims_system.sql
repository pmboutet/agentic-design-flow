-- Migration: Create Claims System for Graph RAG
-- Replaces entity-based extraction with claims-based extraction

-- ============================================================================
-- 1. Create claims table
-- ============================================================================

CREATE TABLE public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,

  -- Content
  statement TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('finding', 'hypothesis', 'recommendation', 'observation')),

  -- Scoring
  evidence_strength DECIMAL(3,2) CHECK (evidence_strength >= 0 AND evidence_strength <= 1),
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),

  -- Metadata
  source_insight_ids UUID[] DEFAULT '{}',

  -- Embeddings for semantic search
  embedding vector(1024),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for claims
CREATE INDEX idx_claims_project_id ON public.claims(project_id);
CREATE INDEX idx_claims_challenge_id ON public.claims(challenge_id);
CREATE INDEX idx_claims_claim_type ON public.claims(claim_type);
CREATE INDEX idx_claims_created_at ON public.claims(created_at DESC);

-- Vector similarity search index
CREATE INDEX idx_claims_embedding ON public.claims
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 2. Add new relationship types to knowledge_graph_edges
-- ============================================================================

-- Drop and recreate the constraint with new types
ALTER TABLE public.knowledge_graph_edges
DROP CONSTRAINT IF EXISTS knowledge_graph_edges_relationship_type_check;

ALTER TABLE public.knowledge_graph_edges
ADD CONSTRAINT knowledge_graph_edges_relationship_type_check
CHECK (relationship_type IN (
  -- Existing types
  'SIMILAR_TO',
  'RELATED_TO',
  'CONTAINS',
  'SYNTHESIZES',
  'MENTIONS',
  'HAS_TYPE',
  'CO_OCCURS',
  -- New claim-related types
  'SUPPORTS',       -- claim/insight supports another claim
  'CONTRADICTS',    -- claim contradicts another claim
  'ADDRESSES',      -- claim addresses a challenge (objective)
  'EVIDENCE_FOR'    -- insight provides evidence for a claim
));

-- ============================================================================
-- 3. Junction table for claim to entity relationships
-- ============================================================================

CREATE TABLE public.claim_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  relevance_score DECIMAL(3,2) DEFAULT 0.5 CHECK (relevance_score >= 0 AND relevance_score <= 1),
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(claim_id, entity_id)
);

CREATE INDEX idx_claim_entities_claim_id ON public.claim_entities(claim_id);
CREATE INDEX idx_claim_entities_entity_id ON public.claim_entities(entity_id);

-- ============================================================================
-- 4. RLS Policies for claims
-- ============================================================================

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on claims"
  ON public.claims
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view claims for projects they have access to
CREATE POLICY "Users can view claims for their projects"
  ON public.claims
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT pm.project_id FROM project_members pm WHERE pm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. RLS Policies for claim_entities
-- ============================================================================

ALTER TABLE public.claim_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on claim_entities"
  ON public.claim_entities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view claim_entities for their projects"
  ON public.claim_entities
  FOR SELECT
  TO authenticated
  USING (
    claim_id IN (
      SELECT c.id FROM claims c
      JOIN project_members pm ON c.project_id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. Helper function: Find similar claims by embedding
-- ============================================================================

CREATE OR REPLACE FUNCTION public.find_similar_claims(
  p_embedding vector(1024),
  p_project_id UUID,
  p_threshold FLOAT DEFAULT 0.75,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  statement TEXT,
  claim_type TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.statement,
    c.claim_type,
    1 - (c.embedding <=> p_embedding) as similarity
  FROM claims c
  WHERE c.project_id = p_project_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> p_embedding) >= p_threshold
  ORDER BY c.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 7. Trigger to update updated_at on claims
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_claims_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_claims_updated_at
  BEFORE UPDATE ON public.claims
  FOR EACH ROW
  EXECUTE FUNCTION public.update_claims_updated_at();

-- ============================================================================
-- 8. Notify PostgREST to reload schema
-- ============================================================================

NOTIFY pgrst, 'reload schema';
