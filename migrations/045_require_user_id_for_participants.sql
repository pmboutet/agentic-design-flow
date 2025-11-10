BEGIN;

-- Migration: Require user_id for all ask_participants with invite_token
-- This prevents 403 errors when using invite tokens for authentication

-- Step 1: Log participants without user_id that will be affected
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.ask_participants
  WHERE user_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE NOTICE '⚠️  Found % participants without user_id', orphan_count;
    RAISE NOTICE 'These participants will be deleted as they cannot authenticate with invite tokens';
  ELSE
    RAISE NOTICE '✅ No orphan participants found';
  END IF;
END $$;

-- Step 2: Delete participants without user_id
-- These cannot be used with invite token authentication
DELETE FROM public.ask_participants
WHERE user_id IS NULL;

-- Step 3: Make user_id NOT NULL to prevent future orphan participants
-- This ensures all participants are linked to a user profile
ALTER TABLE public.ask_participants
ALTER COLUMN user_id SET NOT NULL;

-- Step 4: Update the invite token generation trigger to verify user_id exists
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS TRIGGER AS $$
BEGIN
  -- Verify user_id is present (should be enforced by NOT NULL constraint)
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required for all participants with invite tokens';
  END IF;

  -- Generate invite token if not provided
  IF NEW.invite_token IS NULL THEN
    NEW.invite_token := encode(gen_random_bytes(16), 'hex');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Add a check constraint to ensure user_id is always present
-- This is redundant with NOT NULL but provides a clear error message
ALTER TABLE public.ask_participants
ADD CONSTRAINT ask_participants_user_id_required
CHECK (user_id IS NOT NULL);

COMMENT ON CONSTRAINT ask_participants_user_id_required ON public.ask_participants
IS 'Ensures all participants are linked to a user profile for invite token authentication';

COMMIT;
