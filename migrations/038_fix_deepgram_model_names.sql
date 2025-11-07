-- Migration 038: Fix Deepgram model names to use supported models

BEGIN;

-- Update Anthropic models to use supported Deepgram model names
-- Deepgram supports: claude-3-5-haiku-latest, claude-sonnet-4-20250514
UPDATE public.ai_model_configs
SET 
  deepgram_voice_agent_model = CASE 
    -- If already set to an invalid model, update to haiku
    WHEN deepgram_voice_agent_model = 'claude-3-5-sonnet-20241022' THEN 'claude-3-5-haiku-latest'
    -- For sonnet models, try the supported sonnet model
    WHEN model LIKE '%sonnet%' AND deepgram_voice_agent_model IS NULL THEN 'claude-sonnet-4-20250514'
    -- Otherwise use haiku as default
    WHEN deepgram_voice_agent_model IS NULL THEN 'claude-3-5-haiku-latest'
    ELSE deepgram_voice_agent_model
  END
WHERE provider = 'anthropic'
  AND (
    deepgram_voice_agent_model = 'claude-3-5-sonnet-20241022'
    OR (deepgram_voice_agent_model IS NULL AND model LIKE '%claude%')
  );

COMMIT;

-- //@UNDO
-- This migration fixes invalid values, no undo needed
BEGIN;
COMMIT;

