BEGIN;

-- Add parent_challenge_id column to challenges table
ALTER TABLE public.challenges 
ADD COLUMN IF NOT EXISTS parent_challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_challenges_parent_challenge_id 
ON public.challenges(parent_challenge_id);

COMMIT;
