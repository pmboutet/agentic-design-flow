-- Migration: Add AI challenge builder results storage to projects
-- Description: Adds JSONB column to store AI challenge builder results persistently
-- Date: 2025-01-XX

BEGIN;

-- Add column for AI challenge builder results
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ai_challenge_builder_results JSONB;

-- Add comment
COMMENT ON COLUMN public.projects.ai_challenge_builder_results IS 
  'Stores AI challenge builder results (suggestions, newChallenges, errors, lastRunAt) as JSON';

COMMIT;

-- //@UNDO
BEGIN;
ALTER TABLE public.projects
  DROP COLUMN IF EXISTS ai_challenge_builder_results;
COMMIT;

