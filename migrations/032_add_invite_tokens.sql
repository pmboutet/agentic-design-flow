BEGIN;

-- Add invite_token column to ask_participants for unique participant links
ALTER TABLE public.ask_participants 
ADD COLUMN IF NOT EXISTS invite_token VARCHAR(255);

-- Create unique index on invite_token for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS ask_participants_invite_token_idx 
ON public.ask_participants (invite_token) 
WHERE invite_token IS NOT NULL;

-- Generate invite tokens for existing participants that don't have one
-- Using a combination of ask_session_id and participant id to create unique tokens
UPDATE public.ask_participants
SET invite_token = encode(gen_random_bytes(16), 'hex')
WHERE invite_token IS NULL;

-- Create a function to auto-generate invite tokens on insert
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_token IS NULL THEN
    NEW.invite_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate invite tokens
DROP TRIGGER IF EXISTS trigger_generate_invite_token ON public.ask_participants;
CREATE TRIGGER trigger_generate_invite_token
  BEFORE INSERT ON public.ask_participants
  FOR EACH ROW
  EXECUTE FUNCTION generate_invite_token();

COMMENT ON COLUMN public.ask_participants.invite_token IS 'Unique token for participant invite links. Used to create personalized magic links.';

COMMIT;






