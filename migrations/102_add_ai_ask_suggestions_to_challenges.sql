-- Migration: Add ai_ask_suggestions JSONB column to challenges table
-- This stores AI-generated ASK suggestions for each challenge

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS ai_ask_suggestions JSONB;

-- Add comment explaining the structure
COMMENT ON COLUMN public.challenges.ai_ask_suggestions IS 'Stores AI-generated ASK suggestions. Structure: { suggestions: AiAskSuggestion[], status: "pending"|"generating"|"completed"|"error", lastRunAt: ISO8601, error?: string }';

-- Create index for querying by status (useful for finding generating/pending suggestions)
CREATE INDEX IF NOT EXISTS idx_challenges_ai_ask_suggestions_status
ON public.challenges ((ai_ask_suggestions->>'status'))
WHERE ai_ask_suggestions IS NOT NULL;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
