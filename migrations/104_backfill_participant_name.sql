-- Migration: Backfill participant_name with email fallback
-- This ensures participant_name is never NULL for consistent display name handling

-- Step 1: Backfill participant_name with participant_email where NULL
UPDATE ask_participants
SET participant_name = participant_email
WHERE participant_name IS NULL
  AND participant_email IS NOT NULL
  AND participant_email != '';

-- Step 2: For participants still without a name (no email either),
-- try to get the name from the linked user profile
UPDATE ask_participants ap
SET participant_name = COALESCE(
  p.full_name,
  NULLIF(CONCAT_WS(' ', p.first_name, p.last_name), ''),
  p.email
)
FROM profiles p
WHERE ap.user_id = p.id
  AND ap.participant_name IS NULL;

-- Step 3: Final fallback - generate a name from the participant ID
-- This handles edge cases where there's no email and no linked profile
UPDATE ask_participants
SET participant_name = 'Participant ' || LEFT(id::text, 8)
WHERE participant_name IS NULL;

-- Add comment to document the fallback pattern
COMMENT ON COLUMN ask_participants.participant_name IS
  'Display name for participant. Should be populated via backfill migration. Fallback priority: participant_email → profile.full_name → profile.email → generated ID.';

-- Force schema reload for PostgREST
NOTIFY pgrst, 'reload schema';
