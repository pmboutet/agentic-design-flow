-- Migration 039: Fix Deepgram TTS model names to use aura-2 models

BEGIN;

-- Update TTS models from aura-thalia-en to aura-2-thalia-en
UPDATE public.ai_model_configs
SET 
  deepgram_tts_model = 'aura-2-thalia-en'
WHERE deepgram_tts_model = 'aura-thalia-en'
   OR (deepgram_tts_model IS NULL AND provider IN ('anthropic', 'openai'));

COMMIT;

-- //@UNDO
-- This migration fixes invalid values, no undo needed
BEGIN;
COMMIT;

