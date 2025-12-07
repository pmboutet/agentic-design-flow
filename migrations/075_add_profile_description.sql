BEGIN;

-- Add description field to profiles table for user bio/description
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMIT;

-- //@UNDO
BEGIN;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS description;

COMMIT;
