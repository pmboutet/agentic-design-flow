BEGIN;

-- Table for knowledge entities (keywords, concepts, themes extracted from insights)
CREATE TABLE IF NOT EXISTS public.knowledge_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL, -- Normalized entity name (lowercase, trimmed)
  type VARCHAR(50) NOT NULL DEFAULT 'keyword', -- concept|keyword|theme
  description TEXT,
  embedding vector(1024), -- Voyage AI embedding for semantic search
  frequency INTEGER DEFAULT 1, -- Number of occurrences across insights
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, type)
);

-- Table for knowledge graph edges (relationships between nodes)
CREATE TABLE IF NOT EXISTS public.knowledge_graph_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL,
  source_type VARCHAR(50) NOT NULL, -- insight|entity|challenge|synthesis
  target_id UUID NOT NULL,
  target_type VARCHAR(50) NOT NULL, -- insight|entity|challenge|synthesis
  relationship_type VARCHAR(50) NOT NULL, -- SIMILAR_TO|RELATED_TO|CONTAINS|SYNTHESIZES|MENTIONS
  similarity_score REAL, -- 0-1 similarity score
  confidence REAL, -- 0-1 confidence in the relationship
  metadata JSONB, -- Additional metadata about the relationship
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_relationship_types CHECK (
    relationship_type IN ('SIMILAR_TO', 'RELATED_TO', 'CONTAINS', 'SYNTHESIZES', 'MENTIONS')
  )
);

-- Table for insight syntheses (aggregated insights by theme/concept)
CREATE TABLE IF NOT EXISTS public.insight_syntheses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL,
  synthesized_text TEXT NOT NULL, -- AI-generated synthesis text
  source_insight_ids UUID[] NOT NULL DEFAULT '{}', -- Array of insight IDs that were synthesized
  key_concepts UUID[] DEFAULT '{}', -- Array of knowledge_entities IDs
  embedding vector(1024), -- Voyage AI embedding of synthesized text
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Junction table for insight keywords (mapping insights to extracted entities)
CREATE TABLE IF NOT EXISTS public.insight_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insight_id UUID NOT NULL REFERENCES public.insights(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  relevance_score REAL DEFAULT 0.5, -- 0-1 relevance score
  extraction_method VARCHAR(50) DEFAULT 'ai', -- ai|manual
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(insight_id, entity_id)
);

-- Create indexes for performance

-- Knowledge entities indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_name ON public.knowledge_entities(name);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_type ON public.knowledge_entities(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_embedding_hnsw 
  ON public.knowledge_entities 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Knowledge graph edges indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_edges_source ON public.knowledge_graph_edges(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_edges_target ON public.knowledge_graph_edges(target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_edges_relationship ON public.knowledge_graph_edges(relationship_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_edges_source_type ON public.knowledge_graph_edges(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_edges_target_type ON public.knowledge_graph_edges(target_type, target_id);

-- Insight syntheses indexes
CREATE INDEX IF NOT EXISTS idx_insight_syntheses_project_id ON public.insight_syntheses(project_id);
CREATE INDEX IF NOT EXISTS idx_insight_syntheses_challenge_id ON public.insight_syntheses(challenge_id);
CREATE INDEX IF NOT EXISTS idx_insight_syntheses_embedding_hnsw 
  ON public.insight_syntheses 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_insight_syntheses_key_concepts ON public.insight_syntheses USING GIN (key_concepts);
CREATE INDEX IF NOT EXISTS idx_insight_syntheses_source_insights ON public.insight_syntheses USING GIN (source_insight_ids);

-- Insight keywords indexes
CREATE INDEX IF NOT EXISTS idx_insight_keywords_insight_id ON public.insight_keywords(insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_keywords_entity_id ON public.insight_keywords(entity_id);
CREATE INDEX IF NOT EXISTS idx_insight_keywords_relevance ON public.insight_keywords(relevance_score);

-- Add RLS policies (enabled but policies will be created separately if needed)
ALTER TABLE public.knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_syntheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_keywords ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (users can read, admins can write)
CREATE POLICY "Users can read knowledge entities" ON public.knowledge_entities
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can read knowledge graph edges" ON public.knowledge_graph_edges
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can read insight syntheses" ON public.insight_syntheses
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can read insight keywords" ON public.insight_keywords
  FOR SELECT USING (auth.role() = 'authenticated');

-- Admin policies for write operations (can be refined later based on RLS requirements)
CREATE POLICY "Admins can manage knowledge entities" ON public.knowledge_entities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  );

CREATE POLICY "Admins can manage knowledge graph edges" ON public.knowledge_graph_edges
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  );

CREATE POLICY "Admins can manage insight syntheses" ON public.insight_syntheses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  );

CREATE POLICY "Admins can manage insight keywords" ON public.insight_keywords
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  );

COMMIT;

-- //@UNDO
BEGIN;

-- Drop policies
DROP POLICY IF EXISTS "Admins can manage insight keywords" ON public.insight_keywords;
DROP POLICY IF EXISTS "Admins can manage insight syntheses" ON public.insight_syntheses;
DROP POLICY IF EXISTS "Admins can manage knowledge graph edges" ON public.knowledge_graph_edges;
DROP POLICY IF EXISTS "Admins can manage knowledge entities" ON public.knowledge_entities;
DROP POLICY IF EXISTS "Users can read insight keywords" ON public.insight_keywords;
DROP POLICY IF EXISTS "Users can read insight syntheses" ON public.insight_syntheses;
DROP POLICY IF EXISTS "Users can read knowledge graph edges" ON public.knowledge_graph_edges;
DROP POLICY IF EXISTS "Users can read knowledge entities" ON public.knowledge_entities;

-- Drop indexes
DROP INDEX IF EXISTS public.idx_insight_keywords_relevance;
DROP INDEX IF EXISTS public.idx_insight_keywords_entity_id;
DROP INDEX IF EXISTS public.idx_insight_keywords_insight_id;
DROP INDEX IF EXISTS public.idx_insight_syntheses_source_insights;
DROP INDEX IF EXISTS public.idx_insight_syntheses_key_concepts;
DROP INDEX IF EXISTS public.idx_insight_syntheses_embedding_hnsw;
DROP INDEX IF EXISTS public.idx_insight_syntheses_challenge_id;
DROP INDEX IF EXISTS public.idx_insight_syntheses_project_id;
DROP INDEX IF EXISTS public.idx_knowledge_graph_edges_target_type;
DROP INDEX IF EXISTS public.idx_knowledge_graph_edges_source_type;
DROP INDEX IF EXISTS public.idx_knowledge_graph_edges_relationship;
DROP INDEX IF EXISTS public.idx_knowledge_graph_edges_target;
DROP INDEX IF EXISTS public.idx_knowledge_graph_edges_source;
DROP INDEX IF EXISTS public.idx_knowledge_entities_embedding_hnsw;
DROP INDEX IF EXISTS public.idx_knowledge_entities_type;
DROP INDEX IF EXISTS public.idx_knowledge_entities_name;

-- Drop tables
DROP TABLE IF EXISTS public.insight_keywords CASCADE;
DROP TABLE IF EXISTS public.insight_syntheses CASCADE;
DROP TABLE IF EXISTS public.knowledge_graph_edges CASCADE;
DROP TABLE IF EXISTS public.knowledge_entities CASCADE;

COMMIT;

