-- Migration 041: Add ElevenLabs columns for hybrid voice agent to ai_model_configs

BEGIN;

-- Add columns for ElevenLabs TTS configuration
ALTER TABLE public.ai_model_configs
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id VARCHAR,
  ADD COLUMN IF NOT EXISTS elevenlabs_model_id VARCHAR,
  ADD COLUMN IF NOT EXISTS elevenlabs_api_key_env_var VARCHAR;

-- Add comments to document the columns
COMMENT ON COLUMN public.ai_model_configs.elevenlabs_voice_id IS 
  'ElevenLabs voice ID for text-to-speech (e.g., "21m00Tcm4TlvDq8ikWAM" for Rachel). Default voices available in ElevenLabs dashboard.';

COMMENT ON COLUMN public.ai_model_configs.elevenlabs_model_id IS 
  'ElevenLabs TTS model ID (e.g., "eleven_turbo_v2_5", "eleven_multilingual_v2"). Default: "eleven_turbo_v2_5"';

COMMENT ON COLUMN public.ai_model_configs.elevenlabs_api_key_env_var IS 
  'Environment variable name for ElevenLabs API key (e.g., "ELEVENLABS_API_KEY"). Default: "ELEVENLABS_API_KEY"';

COMMIT;

-- //@UNDO
BEGIN;

ALTER TABLE public.ai_model_configs
  DROP COLUMN IF EXISTS elevenlabs_voice_id,
  DROP COLUMN IF EXISTS elevenlabs_model_id,
  DROP COLUMN IF EXISTS elevenlabs_api_key_env_var;

COMMIT;


