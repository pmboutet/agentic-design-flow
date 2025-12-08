-- Migration: Add expected_duration_minutes to ask_sessions for conversation pacing
-- This field controls the AI agent's pacing behavior during conversations

-- Add the column with a sensible default (8 minutes = sustained attention sweet spot)
ALTER TABLE ask_sessions
ADD COLUMN IF NOT EXISTS expected_duration_minutes INTEGER DEFAULT 8;

-- Add constraint to ensure valid range (1-30 minutes)
ALTER TABLE ask_sessions
DROP CONSTRAINT IF EXISTS check_expected_duration_range;

ALTER TABLE ask_sessions
ADD CONSTRAINT check_expected_duration_range
CHECK (expected_duration_minutes IS NULL OR (expected_duration_minutes >= 1 AND expected_duration_minutes <= 30));

-- Add comment for documentation
COMMENT ON COLUMN ask_sessions.expected_duration_minutes IS
'Expected conversation duration in minutes (1-30). Used to adapt AI agent pacing behavior. Default is 8 minutes (optimal sustained attention).';

-- Grant permissions for service role
GRANT ALL ON ask_sessions TO service_role;
