-- Migration 079: Add Speechmatics diarization configuration columns to ai_model_configs

BEGIN;

-- Add columns for Speechmatics diarization configuration
-- These enable speaker identification in real-time transcription
ALTER TABLE public.ai_model_configs
  ADD COLUMN IF NOT EXISTS speechmatics_diarization VARCHAR CHECK (speechmatics_diarization IN ('none', 'speaker', 'channel', 'channel_and_speaker')),
  ADD COLUMN IF NOT EXISTS speechmatics_speaker_sensitivity NUMERIC(2,1) CHECK (speechmatics_speaker_sensitivity >= 0 AND speechmatics_speaker_sensitivity <= 1),
  ADD COLUMN IF NOT EXISTS speechmatics_prefer_current_speaker BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS speechmatics_max_speakers INTEGER CHECK (speechmatics_max_speakers IS NULL OR speechmatics_max_speakers >= 2);

-- Add comments to document the columns
COMMENT ON COLUMN public.ai_model_configs.speechmatics_diarization IS
  'Speechmatics diarization mode: "none" (disabled), "speaker" (voice-based), "channel" (audio channel), "channel_and_speaker" (both). Default: "speaker"';

COMMENT ON COLUMN public.ai_model_configs.speechmatics_speaker_sensitivity IS
  'Speaker sensitivity (0.0-1.0). Higher values detect more unique speakers. Default: 0.5';

COMMENT ON COLUMN public.ai_model_configs.speechmatics_prefer_current_speaker IS
  'When true, reduces false speaker switches between similar voices. Default: true';

COMMENT ON COLUMN public.ai_model_configs.speechmatics_max_speakers IS
  'Maximum number of speakers to detect (>=2). Null means unlimited. Default: null (unlimited)';

COMMIT;

-- //@UNDO
BEGIN;

ALTER TABLE public.ai_model_configs
  DROP COLUMN IF EXISTS speechmatics_diarization,
  DROP COLUMN IF EXISTS speechmatics_speaker_sensitivity,
  DROP COLUMN IF EXISTS speechmatics_prefer_current_speaker,
  DROP COLUMN IF EXISTS speechmatics_max_speakers;

COMMIT;
