-- Migration 056: Add voice flag to ai_agents table
-- This flag indicates whether an agent is a voice agent or a text/JSON agent

BEGIN;

-- Add voice column to ai_agents table
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS voice BOOLEAN DEFAULT false NOT NULL;

-- Update existing agents based on their slug
-- Agents with 'voice' in their slug are voice agents
UPDATE public.ai_agents
SET voice = true
WHERE slug LIKE '%voice%' OR slug LIKE '%speech%';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS ai_agents_voice_idx ON public.ai_agents(voice);

COMMIT;

-- //@UNDO
BEGIN;

DROP INDEX IF EXISTS ai_agents_voice_idx;
ALTER TABLE public.ai_agents DROP COLUMN IF EXISTS voice;

COMMIT;






