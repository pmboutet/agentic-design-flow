BEGIN;

-- Add related_challenge_ids array column to insights if missing
ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS related_challenge_ids UUID[] DEFAULT '{}'::uuid[];

COMMIT;

-- //@UNDO
BEGIN;

ALTER TABLE public.insights
  DROP COLUMN IF EXISTS related_challenge_ids;

COMMIT;


