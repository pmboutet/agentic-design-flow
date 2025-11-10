-- Migration 049: Add Speechmatics Voice Agent specific columns to ai_model_configs

BEGIN;

-- Add columns for Speechmatics Voice Agent configuration
-- These store the exact values required by Speechmatics Real-Time API
ALTER TABLE public.ai_model_configs
  ADD COLUMN IF NOT EXISTS speechmatics_stt_language VARCHAR,
  ADD COLUMN IF NOT EXISTS speechmatics_stt_operating_point VARCHAR CHECK (speechmatics_stt_operating_point IN ('enhanced', 'standard')),
  ADD COLUMN IF NOT EXISTS speechmatics_stt_max_delay NUMERIC(3,1) DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS speechmatics_stt_enable_partials BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS speechmatics_llm_provider VARCHAR CHECK (speechmatics_llm_provider IN ('anthropic', 'openai')),
  ADD COLUMN IF NOT EXISTS speechmatics_llm_model VARCHAR,
  ADD COLUMN IF NOT EXISTS speechmatics_api_key_env_var VARCHAR DEFAULT 'SPEECHMATICS_API_KEY';

-- Add comments to document the columns
COMMENT ON COLUMN public.ai_model_configs.speechmatics_stt_language IS 
  'Speechmatics STT language (e.g., "fr", "en", "multi", "fr,en"). Supports multilingual and code-switching.';

COMMENT ON COLUMN public.ai_model_configs.speechmatics_stt_operating_point IS 
  'Speechmatics STT operating point: "enhanced" for maximum accuracy (slower) or "standard" for faster processing.';

COMMENT ON COLUMN public.ai_model_configs.speechmatics_stt_max_delay IS 
  'Maximum delay in seconds between transcription segments (default: 2.0).';

COMMENT ON COLUMN public.ai_model_configs.speechmatics_stt_enable_partials IS 
  'Enable partial transcription results (interim results) for real-time feedback.';

COMMENT ON COLUMN public.ai_model_configs.speechmatics_llm_provider IS 
  'LLM provider for Speechmatics Voice Agent ("anthropic" or "openai")';

COMMENT ON COLUMN public.ai_model_configs.speechmatics_llm_model IS 
  'LLM model name for Speechmatics Voice Agent (e.g., "claude-3-5-haiku-latest", "gpt-4o")';

COMMENT ON COLUMN public.ai_model_configs.speechmatics_api_key_env_var IS 
  'Environment variable name for Speechmatics API key (default: "SPEECHMATICS_API_KEY")';

COMMIT;

-- //@UNDO
BEGIN;

ALTER TABLE public.ai_model_configs
  DROP COLUMN IF EXISTS speechmatics_stt_language,
  DROP COLUMN IF EXISTS speechmatics_stt_operating_point,
  DROP COLUMN IF EXISTS speechmatics_stt_max_delay,
  DROP COLUMN IF EXISTS speechmatics_stt_enable_partials,
  DROP COLUMN IF EXISTS speechmatics_llm_provider,
  DROP COLUMN IF EXISTS speechmatics_llm_model,
  DROP COLUMN IF EXISTS speechmatics_api_key_env_var;

COMMIT;

