BEGIN;

-- Function to find similar insights using vector similarity search
CREATE OR REPLACE FUNCTION find_similar_insights(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10,
  exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    1 - (i.content_embedding <=> query_embedding) as similarity
  FROM insights i
  WHERE i.content_embedding IS NOT NULL
    AND (exclude_id IS NULL OR i.id != exclude_id)
    AND (1 - (i.content_embedding <=> query_embedding)) >= match_threshold
  ORDER BY i.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to calculate similarity score between two embeddings
CREATE OR REPLACE FUNCTION insights_similarity_score(
  embedding1 vector(1024),
  embedding2 vector(1024)
)
RETURNS float
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 1 - (embedding1 <=> embedding2);
$$;

-- Function to find similar knowledge entities
CREATE OR REPLACE FUNCTION find_similar_entities(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10,
  entity_type varchar DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name varchar,
  type varchar,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.name,
    ke.type,
    1 - (ke.embedding <=> query_embedding) as similarity
  FROM knowledge_entities ke
  WHERE ke.embedding IS NOT NULL
    AND (entity_type IS NULL OR ke.type = entity_type)
    AND (1 - (ke.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to find similar syntheses
CREATE OR REPLACE FUNCTION find_similar_syntheses(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10,
  project_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  synthesized_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    isyn.id,
    isyn.project_id,
    isyn.synthesized_text,
    1 - (isyn.embedding <=> query_embedding) as similarity
  FROM insight_syntheses isyn
  WHERE isyn.embedding IS NOT NULL
    AND (project_id_filter IS NULL OR isyn.project_id = project_id_filter)
    AND (1 - (isyn.embedding <=> query_embedding)) >= match_threshold
  ORDER BY isyn.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create indexes if they don't exist (for better performance)
-- Note: These should already exist from migration 023, but adding here for safety
CREATE INDEX IF NOT EXISTS idx_insights_content_embedding_hnsw 
  ON insights 
  USING hnsw (content_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_insights_summary_embedding_hnsw 
  ON insights 
  USING hnsw (summary_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_knowledge_entities_embedding_hnsw 
  ON knowledge_entities 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_insight_syntheses_embedding_hnsw 
  ON insight_syntheses 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON FUNCTION find_similar_insights IS 'Find insights similar to a query embedding using cosine distance';
COMMENT ON FUNCTION insights_similarity_score IS 'Calculate cosine similarity score between two embeddings (0-1, where 1 is identical)';
COMMENT ON FUNCTION find_similar_entities IS 'Find knowledge entities similar to a query embedding';
COMMENT ON FUNCTION find_similar_syntheses IS 'Find insight syntheses similar to a query embedding';

COMMIT;

-- //@UNDO
BEGIN;

DROP FUNCTION IF EXISTS find_similar_syntheses(vector, float, int, uuid);
DROP FUNCTION IF EXISTS find_similar_entities(vector, float, int, varchar);
DROP FUNCTION IF EXISTS insights_similarity_score(vector, vector);
DROP FUNCTION IF EXISTS find_similar_insights(vector, float, int, uuid);

COMMIT;

