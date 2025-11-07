-- Migration 037: Initialize Deepgram Voice Agent configurations for existing models

BEGIN;

-- Update Anthropic models with Deepgram configuration
-- Note: Deepgram supports "claude-3-5-haiku-latest" and "claude-sonnet-4-20250514"
-- Using haiku as default as it's more commonly available
UPDATE public.ai_model_configs
SET 
  deepgram_voice_agent_model = 'claude-3-5-haiku-latest',
  deepgram_llm_provider = 'anthropic',
  deepgram_stt_model = 'nova-2',
  deepgram_tts_model = 'aura-2-thalia-en'
WHERE provider = 'anthropic'
  AND (deepgram_voice_agent_model IS NULL OR deepgram_llm_provider IS NULL);

-- Update OpenAI models with Deepgram configuration
UPDATE public.ai_model_configs
SET 
  deepgram_voice_agent_model = 'gpt-4o',
  deepgram_llm_provider = 'openai',
  deepgram_stt_model = 'nova-2',
  deepgram_tts_model = 'aura-2-thalia-en'
WHERE provider = 'openai'
  AND (deepgram_voice_agent_model IS NULL OR deepgram_llm_provider IS NULL);

-- For models with 'claude-sonnet-4-5' or similar, map to the correct Deepgram model name
UPDATE public.ai_model_configs
SET 
  deepgram_voice_agent_model = 'claude-3-5-sonnet-20241022',
  deepgram_llm_provider = 'anthropic',
  deepgram_stt_model = COALESCE(deepgram_stt_model, 'nova-2'),
  deepgram_tts_model = COALESCE(deepgram_tts_model, 'aura-thalia-en')
WHERE provider = 'anthropic'
  AND (model LIKE '%sonnet%' OR model LIKE '%claude%')
  AND deepgram_voice_agent_model IS NULL;

COMMIT;

-- //@UNDO
-- This migration only sets default values, no undo needed
BEGIN;
COMMIT;

