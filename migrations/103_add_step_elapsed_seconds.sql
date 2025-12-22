-- Migration: Add elapsed_active_seconds to conversation plan steps
-- Purpose: Track real active time per step (from UI timer with auto-pause)

-- Add elapsed_active_seconds column to track active time per step
ALTER TABLE ask_conversation_plan_steps
ADD COLUMN IF NOT EXISTS elapsed_active_seconds INTEGER DEFAULT 0;

-- Add index for efficient queries on elapsed time
CREATE INDEX IF NOT EXISTS idx_plan_steps_elapsed
ON ask_conversation_plan_steps(plan_id, elapsed_active_seconds);

-- Add comment for documentation
COMMENT ON COLUMN ask_conversation_plan_steps.elapsed_active_seconds IS
  'Active time spent on this step in seconds (tracked by UI timer, excludes pauses)';

-- Backfill existing completed steps with estimated elapsed time based on timestamps
-- For steps that have both activated_at and completed_at, calculate the wall-clock duration
-- This is an approximation since we don't have pause data for historical steps
UPDATE ask_conversation_plan_steps
SET elapsed_active_seconds = GREATEST(0,
  EXTRACT(EPOCH FROM (completed_at - activated_at))::INTEGER
)
WHERE completed_at IS NOT NULL
  AND activated_at IS NOT NULL
  AND elapsed_active_seconds = 0;
