-- Migration: Add summary_error field to track step summarizer failures
-- This field stores error messages when the ask-conversation-step-summarizer agent fails

-- Add summary_error column to ask_conversation_plan_steps table
ALTER TABLE ask_conversation_plan_steps
ADD COLUMN IF NOT EXISTS summary_error TEXT DEFAULT NULL;

-- Add comment explaining the field's purpose
COMMENT ON COLUMN ask_conversation_plan_steps.summary_error IS 'Stores error message when step summarization fails. NULL means no error occurred.';

-- Create index for quick lookup of steps with errors
CREATE INDEX IF NOT EXISTS idx_plan_steps_summary_error
ON ask_conversation_plan_steps(summary_error)
WHERE summary_error IS NOT NULL;
