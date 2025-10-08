BEGIN;

-- Ensure the foreign key relationship exists properly
-- Drop and recreate the foreign key constraint to ensure it's properly recognized
ALTER TABLE public.ask_participants 
DROP CONSTRAINT IF EXISTS ask_participants_user_id_fkey;

ALTER TABLE public.ask_participants 
ADD CONSTRAINT ask_participants_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Add missing columns if they don't exist
ALTER TABLE public.ask_participants 
ADD COLUMN IF NOT EXISTS is_spokesperson BOOLEAN DEFAULT false;

-- Ensure the unique constraint exists
DROP INDEX IF EXISTS ask_participants_session_user_idx;
CREATE UNIQUE INDEX IF NOT EXISTS ask_participants_session_user_idx
  ON public.ask_participants (ask_session_id, user_id)
  WHERE user_id IS NOT NULL;

COMMIT;
