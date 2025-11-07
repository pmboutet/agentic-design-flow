-- Migration 036: Add Deepgram Voice Agent specific columns to ai_model_configs

BEGIN;

-- Add columns for Deepgram Voice Agent configuration
-- These store the exact values required by Deepgram API
ALTER TABLE public.ai_model_configs
  ADD COLUMN IF NOT EXISTS deepgram_voice_agent_model VARCHAR,
  ADD COLUMN IF NOT EXISTS deepgram_stt_model VARCHAR,
  ADD COLUMN IF NOT EXISTS deepgram_tts_model VARCHAR,
  ADD COLUMN IF NOT EXISTS deepgram_llm_provider VARCHAR CHECK (deepgram_llm_provider IN ('anthropic', 'openai'));

-- Add comments to document the columns
COMMENT ON COLUMN public.ai_model_configs.deepgram_voice_agent_model IS 
  'Exact model name for Deepgram Voice Agent LLM (e.g., "claude-3-5-sonnet-20241022", "gpt-4o"). Must match Deepgram API requirements exactly.';

COMMENT ON COLUMN public.ai_model_configs.deepgram_stt_model IS 
  'Deepgram Speech-to-Text model (e.g., "nova-2", "nova-3")';

COMMENT ON COLUMN public.ai_model_configs.deepgram_tts_model IS 
  'Deepgram Text-to-Speech model (e.g., "aura-thalia-en", "aura-2-thalia-en")';

COMMENT ON COLUMN public.ai_model_configs.deepgram_llm_provider IS 
  'LLM provider for Deepgram Voice Agent ("anthropic" or "openai")';

COMMIT;

-- //@UNDO
BEGIN;

ALTER TABLE public.ai_model_configs
  DROP COLUMN IF EXISTS deepgram_voice_agent_model,
  DROP COLUMN IF EXISTS deepgram_stt_model,
  DROP COLUMN IF EXISTS deepgram_tts_model,
  DROP COLUMN IF EXISTS deepgram_llm_provider;

COMMIT;

