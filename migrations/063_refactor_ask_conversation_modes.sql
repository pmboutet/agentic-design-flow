-- Migration 063: Refactor ASK conversation modes
-- Simplify from 2 fields (audience_scope + response_mode) to 1 field (conversation_mode)
-- New model supports 3 clear scenarios:
-- 1. individual_parallel: Multiple people respond individually, no cross-visibility
-- 2. collaborative: Multi-voice conversation, everyone sees everything
-- 3. group_reporter: Group contributes, one reporter consolidates

BEGIN;

-- Add new conversation_mode column
ALTER TABLE public.ask_sessions
  ADD COLUMN IF NOT EXISTS conversation_mode VARCHAR(30);

-- Migrate existing data to new conversation_mode
-- Mapping logic:
-- audience_scope='individual' → individual_parallel
-- audience_scope='group' + response_mode='simultaneous' → individual_parallel
-- audience_scope='group' + response_mode='collective' + no spokesperson → collaborative
-- audience_scope='group' + response_mode='collective' + has spokesperson → group_reporter
UPDATE public.ask_sessions as1
SET conversation_mode = CASE
  -- Individual scope always maps to individual_parallel
  WHEN as1.audience_scope = 'individual' THEN 'individual_parallel'

  -- Group with simultaneous responses maps to individual_parallel
  WHEN as1.audience_scope = 'group' AND as1.response_mode = 'simultaneous' THEN 'individual_parallel'

  -- Group with collective responses:
  -- If there's a spokesperson, use group_reporter; otherwise collaborative
  WHEN as1.audience_scope = 'group' AND as1.response_mode = 'collective' THEN
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.ask_participants ap
        WHERE ap.ask_session_id = as1.id AND ap.is_spokesperson = true
      ) THEN 'group_reporter'
      ELSE 'collaborative'
    END

  -- Default fallback
  ELSE 'collaborative'
END
WHERE conversation_mode IS NULL;

-- Add constraint for valid conversation_mode values
ALTER TABLE public.ask_sessions
  ADD CONSTRAINT check_conversation_mode
  CHECK (conversation_mode IN ('individual_parallel', 'collaborative', 'group_reporter'));

-- Make conversation_mode NOT NULL after data migration
ALTER TABLE public.ask_sessions
  ALTER COLUMN conversation_mode SET NOT NULL;

-- Add default for new records
ALTER TABLE public.ask_sessions
  ALTER COLUMN conversation_mode SET DEFAULT 'collaborative';

-- Add comment to document the column
COMMENT ON COLUMN public.ask_sessions.conversation_mode IS
  'Mode de conversation: individual_parallel (réponses individuelles en parallèle), collaborative (conversation multi-voix), group_reporter (groupe avec rapporteur)';

-- Keep old columns for now (will be removed in a future migration after verification)
-- This allows rollback if needed
COMMENT ON COLUMN public.ask_sessions.audience_scope IS 'DEPRECATED: Use conversation_mode instead';
COMMENT ON COLUMN public.ask_sessions.response_mode IS 'DEPRECATED: Use conversation_mode instead';

-- Update conversation_threads to reflect new logic
-- individual_parallel: is_shared = false (individual threads)
-- collaborative: is_shared = true (shared thread)
-- group_reporter: is_shared = true (shared thread with designated reporter)
UPDATE public.conversation_threads ct
SET is_shared = CASE
  WHEN (SELECT conversation_mode FROM public.ask_sessions WHERE id = ct.ask_session_id) = 'individual_parallel'
    THEN false
  ELSE true
END;

COMMIT;

-- //@UNDO
BEGIN;

-- Remove conversation_mode column
ALTER TABLE public.ask_sessions
  DROP CONSTRAINT IF EXISTS check_conversation_mode;

ALTER TABLE public.ask_sessions
  DROP COLUMN IF EXISTS conversation_mode;

-- Restore comments on old columns
COMMENT ON COLUMN public.ask_sessions.audience_scope IS 'Portée de l''audience: individual ou group';
COMMENT ON COLUMN public.ask_sessions.response_mode IS 'Mode de réponse: collective ou simultaneous';

COMMIT;
