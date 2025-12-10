-- Migration: Add elapsed_active_seconds to ask_participants for session timer persistence
-- This field stores the accumulated active time for each participant in a conversation

-- Add the column with a default of 0 (no time elapsed)
ALTER TABLE ask_participants
ADD COLUMN IF NOT EXISTS elapsed_active_seconds INTEGER DEFAULT 0;

-- Add constraint to ensure non-negative values
ALTER TABLE ask_participants
DROP CONSTRAINT IF EXISTS check_elapsed_active_seconds_positive;

ALTER TABLE ask_participants
ADD CONSTRAINT check_elapsed_active_seconds_positive
CHECK (elapsed_active_seconds >= 0);

-- Add comment for documentation
COMMENT ON COLUMN ask_participants.elapsed_active_seconds IS
'Accumulated active session time in seconds. Tracks time when participant was actively engaged (AI streaming, typing, speaking). Synced periodically from client.';

-- Grant permissions for service role
GRANT ALL ON ask_participants TO service_role;
