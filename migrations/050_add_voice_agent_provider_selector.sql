-- Migration 050: Add voice_agent_provider selector column to ai_model_configs

BEGIN;

-- Add column to select between deepgram-voice-agent and speechmatics-voice-agent
ALTER TABLE public.ai_model_configs
  ADD COLUMN IF NOT EXISTS voice_agent_provider VARCHAR CHECK (voice_agent_provider IN ('deepgram-voice-agent', 'speechmatics-voice-agent'));

COMMENT ON COLUMN public.ai_model_configs.voice_agent_provider IS
  'Voice agent provider selector: "deepgram-voice-agent" or "speechmatics-voice-agent". Used to determine which voice agent configuration to use.';

COMMIT;

-- //@UNDO
BEGIN;

ALTER TABLE public.ai_model_configs
  DROP COLUMN IF EXISTS voice_agent_provider;

COMMIT;

