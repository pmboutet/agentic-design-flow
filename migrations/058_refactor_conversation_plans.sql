-- Migration: Refactor conversation plans to follow best practices
-- This migration:
-- 1. Refactors ask_conversation_plans table to extract metadata from plan_data
-- 2. Creates ask_conversation_plan_steps table for normalized step storage
-- 3. Adds plan_step_id foreign keys to messages and insights tables
-- 4. Migrates existing plan_data to new structure
-- 5. Adds indexes for performance

-- ============================================================
-- STEP 1: Create new ask_conversation_plan_steps table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ask_conversation_plan_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES public.ask_conversation_plans(id) ON DELETE CASCADE,

  -- Step identification
  step_identifier VARCHAR(100) NOT NULL, -- e.g., "step_1", "step_2"
  step_order INTEGER NOT NULL, -- 1, 2, 3, etc.

  -- Step content
  title TEXT NOT NULL,
  objective TEXT NOT NULL,

  -- Step status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Values: 'pending', 'active', 'completed', 'skipped'

  -- AI-generated summary (populated when step completes)
  summary TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ, -- When status changed to 'active'
  completed_at TIMESTAMPTZ, -- When status changed to 'completed'

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'active', 'completed', 'skipped')),
  CONSTRAINT unique_plan_step_identifier UNIQUE (plan_id, step_identifier),
  CONSTRAINT unique_plan_step_order UNIQUE (plan_id, step_order)
);

-- Indexes for performance
CREATE INDEX idx_plan_steps_plan_id ON public.ask_conversation_plan_steps(plan_id);
CREATE INDEX idx_plan_steps_status ON public.ask_conversation_plan_steps(status);
CREATE INDEX idx_plan_steps_step_identifier ON public.ask_conversation_plan_steps(step_identifier);
CREATE INDEX idx_plan_steps_order ON public.ask_conversation_plan_steps(plan_id, step_order);

-- Comments
COMMENT ON TABLE public.ask_conversation_plan_steps IS
'Stores individual steps for conversation plans. Each step represents a stage in the conversation flow with its own objective, status, and AI-generated summary.';

COMMENT ON COLUMN public.ask_conversation_plan_steps.step_identifier IS
'Unique identifier for the step within the plan (e.g., "step_1", "step_2"). Used in STEP_COMPLETE:<ID> markers.';

COMMENT ON COLUMN public.ask_conversation_plan_steps.step_order IS
'Sequential order of the step in the plan (1-based index).';

COMMENT ON COLUMN public.ask_conversation_plan_steps.summary IS
'AI-generated summary of what was discussed/accomplished during this step. Generated automatically when step completes.';

COMMENT ON COLUMN public.ask_conversation_plan_steps.activated_at IS
'Timestamp when the step became active. Used to determine which messages belong to this step.';

COMMENT ON COLUMN public.ask_conversation_plan_steps.completed_at IS
'Timestamp when the step was completed. Used to determine which messages belong to this step.';

-- ============================================================
-- STEP 2: Add new columns to ask_conversation_plans
-- ============================================================

-- Add metadata columns (extract from plan_data)
ALTER TABLE public.ask_conversation_plans
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS objective TEXT,
ADD COLUMN IF NOT EXISTS total_steps INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_steps INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Add constraint for status (using DO block to handle IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_plan_status'
  ) THEN
    ALTER TABLE public.ask_conversation_plans
    ADD CONSTRAINT valid_plan_status
    CHECK (status IN ('active', 'completed', 'abandoned'));
  END IF;
END $$;

-- Add index for status
CREATE INDEX IF NOT EXISTS idx_conversation_plans_status
ON public.ask_conversation_plans(status);

-- Comments
COMMENT ON COLUMN public.ask_conversation_plans.title IS
'Global title/theme of the conversation plan.';

COMMENT ON COLUMN public.ask_conversation_plans.objective IS
'Overall objective of the conversation plan.';

COMMENT ON COLUMN public.ask_conversation_plans.total_steps IS
'Total number of steps in the plan.';

COMMENT ON COLUMN public.ask_conversation_plans.completed_steps IS
'Number of completed steps. Updated automatically when steps are completed.';

COMMENT ON COLUMN public.ask_conversation_plans.status IS
'Overall status of the plan: active (in progress), completed (all steps done), abandoned (stopped before completion).';

-- ============================================================
-- STEP 3: Add plan_step_id to messages table
-- ============================================================

-- Add foreign key to link messages to plan steps
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS plan_step_id UUID REFERENCES public.ask_conversation_plan_steps(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_messages_plan_step_id
ON public.messages(plan_step_id)
WHERE plan_step_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.messages.plan_step_id IS
'Links this message to a specific step in the conversation plan. NULL if message was created before/without a plan or during plan generation.';

-- ============================================================
-- STEP 4: Add plan_step_id to insights table
-- ============================================================

-- Add foreign key to link insights to plan steps
ALTER TABLE public.insights
ADD COLUMN IF NOT EXISTS plan_step_id UUID REFERENCES public.ask_conversation_plan_steps(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_insights_plan_step_id
ON public.insights(plan_step_id)
WHERE plan_step_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.insights.plan_step_id IS
'Links this insight to a specific step in the conversation plan. NULL if insight was created before/without a plan.';

-- ============================================================
-- STEP 5: Migrate existing plan_data to new structure
-- ============================================================

DO $$
DECLARE
  plan_record RECORD;
  step_record JSONB;
  step_order_counter INTEGER;
  new_step_id UUID;
  step_status TEXT;
  step_created_at TIMESTAMPTZ;
  step_activated_at TIMESTAMPTZ;
  step_completed_at TIMESTAMPTZ;
BEGIN
  -- Loop through all existing plans
  FOR plan_record IN
    SELECT id, plan_data, current_step_id, created_at
    FROM public.ask_conversation_plans
    WHERE plan_data IS NOT NULL
  LOOP
    -- Extract steps array from plan_data
    IF plan_record.plan_data ? 'steps' THEN
      step_order_counter := 1;

      -- Loop through each step in the steps array
      FOR step_record IN
        SELECT * FROM jsonb_array_elements(plan_record.plan_data->'steps')
      LOOP
        -- Extract step data
        step_status := step_record->>'status';

        -- Set timestamps based on status and order
        step_created_at := plan_record.created_at;
        step_activated_at := NULL;
        step_completed_at := NULL;

        -- If step has explicit timestamps in JSON, use those
        IF step_record ? 'created_at' AND step_record->>'created_at' IS NOT NULL THEN
          step_created_at := (step_record->>'created_at')::TIMESTAMPTZ;
        END IF;

        IF step_status = 'active' OR step_status = 'completed' THEN
          step_activated_at := step_created_at;
        END IF;

        IF step_status = 'completed' THEN
          IF step_record ? 'completed_at' AND step_record->>'completed_at' IS NOT NULL THEN
            step_completed_at := (step_record->>'completed_at')::TIMESTAMPTZ;
          ELSE
            step_completed_at := step_created_at;
          END IF;
        END IF;

        -- Insert step into new table
        INSERT INTO public.ask_conversation_plan_steps (
          plan_id,
          step_identifier,
          step_order,
          title,
          objective,
          status,
          summary,
          created_at,
          activated_at,
          completed_at
        ) VALUES (
          plan_record.id,
          step_record->>'id',
          step_order_counter,
          step_record->>'title',
          step_record->>'objective',
          step_status,
          step_record->>'summary',
          step_created_at,
          step_activated_at,
          step_completed_at
        )
        RETURNING id INTO new_step_id;

        step_order_counter := step_order_counter + 1;
      END LOOP;

      -- Update plan metadata
      UPDATE public.ask_conversation_plans
      SET
        total_steps = step_order_counter - 1,
        completed_steps = (
          SELECT COUNT(*)
          FROM public.ask_conversation_plan_steps
          WHERE plan_id = plan_record.id AND status = 'completed'
        ),
        status = CASE
          WHEN (SELECT COUNT(*) FROM public.ask_conversation_plan_steps WHERE plan_id = plan_record.id AND status = 'completed') = (step_order_counter - 1) THEN 'completed'
          ELSE 'active'
        END
      WHERE id = plan_record.id;

    END IF;
  END LOOP;

  RAISE NOTICE 'Migration completed successfully';
END $$;

-- ============================================================
-- STEP 6: RLS Policies for ask_conversation_plan_steps
-- ============================================================

-- Enable RLS
ALTER TABLE public.ask_conversation_plan_steps ENABLE ROW LEVEL SECURITY;

-- Service role: Full access
CREATE POLICY "Service role has full access to plan steps"
  ON public.ask_conversation_plan_steps
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: Can view steps if they can access the plan
CREATE POLICY "Users can view plan steps if they can access the plan"
  ON public.ask_conversation_plan_steps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ask_conversation_plans p
      INNER JOIN public.conversation_threads ct ON p.conversation_thread_id = ct.id
      INNER JOIN public.ask_sessions a ON ct.ask_session_id = a.id
      WHERE p.id = ask_conversation_plan_steps.plan_id
        AND (
          a.created_by = auth.uid()
          OR ct.user_id = auth.uid()
        )
    )
  );

-- Authenticated users: Can update steps if they can edit the session
CREATE POLICY "Users can update plan steps if they can edit the session"
  ON public.ask_conversation_plan_steps
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ask_conversation_plans p
      INNER JOIN public.conversation_threads ct ON p.conversation_thread_id = ct.id
      INNER JOIN public.ask_sessions a ON ct.ask_session_id = a.id
      WHERE p.id = ask_conversation_plan_steps.plan_id
        AND (
          a.created_by = auth.uid()
          OR ct.user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ask_conversation_plans p
      INNER JOIN public.conversation_threads ct ON p.conversation_thread_id = ct.id
      INNER JOIN public.ask_sessions a ON ct.ask_session_id = a.id
      WHERE p.id = ask_conversation_plan_steps.plan_id
        AND (
          a.created_by = auth.uid()
          OR ct.user_id = auth.uid()
        )
    )
  );

-- Authenticated users: Can insert steps if they can edit the session
CREATE POLICY "Users can insert plan steps if they can edit the session"
  ON public.ask_conversation_plan_steps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ask_conversation_plans p
      INNER JOIN public.conversation_threads ct ON p.conversation_thread_id = ct.id
      INNER JOIN public.ask_sessions a ON ct.ask_session_id = a.id
      WHERE p.id = ask_conversation_plan_steps.plan_id
        AND (
          a.created_by = auth.uid()
          OR ct.user_id = auth.uid()
        )
    )
  );

-- Authenticated users: Can delete steps if they own the session
CREATE POLICY "Users can delete plan steps if they own the session"
  ON public.ask_conversation_plan_steps
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ask_conversation_plans p
      INNER JOIN public.conversation_threads ct ON p.conversation_thread_id = ct.id
      INNER JOIN public.ask_sessions a ON ct.ask_session_id = a.id
      WHERE p.id = ask_conversation_plan_steps.plan_id
        AND a.created_by = auth.uid()
    )
  );

-- Anonymous users: Can view steps for shared threads
CREATE POLICY "Anonymous users can view plan steps for shared threads"
  ON public.ask_conversation_plan_steps
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.ask_conversation_plans p
      INNER JOIN public.conversation_threads ct ON p.conversation_thread_id = ct.id
      WHERE p.id = ask_conversation_plan_steps.plan_id
        AND ct.is_shared = true
    )
  );

-- ============================================================
-- STEP 7: Optional - Keep plan_data for backward compatibility
-- ============================================================

-- We keep plan_data column but it's now considered legacy
-- New code should use the normalized tables instead
COMMENT ON COLUMN public.ask_conversation_plans.plan_data IS
'LEGACY: Original JSONB structure with steps array. Kept for backward compatibility. New code should use ask_conversation_plan_steps table instead.';

-- ============================================================
-- STEP 8: Create helper functions
-- ============================================================

-- Function to get current active step for a plan
CREATE OR REPLACE FUNCTION get_current_plan_step(p_plan_id UUID)
RETURNS TABLE (
  id UUID,
  step_identifier VARCHAR(100),
  step_order INTEGER,
  title TEXT,
  objective TEXT,
  status VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.step_identifier,
    s.step_order,
    s.title,
    s.objective,
    s.status
  FROM public.ask_conversation_plan_steps s
  WHERE s.plan_id = p_plan_id
    AND s.status = 'active'
  ORDER BY s.step_order
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_current_plan_step IS
'Returns the currently active step for a given plan. Returns NULL if no active step.';

-- Function to get messages for a specific step
CREATE OR REPLACE FUNCTION get_step_messages(p_step_id UUID)
RETURNS TABLE (
  id UUID,
  sender_type VARCHAR(50),
  content TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.sender_type,
    m.content,
    m.created_at
  FROM public.messages m
  WHERE m.plan_step_id = p_step_id
  ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_step_messages IS
'Returns all messages associated with a specific plan step, ordered chronologically.';

-- Function to update plan progress counters
CREATE OR REPLACE FUNCTION update_plan_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Update completed_steps counter
  UPDATE public.ask_conversation_plans
  SET
    completed_steps = (
      SELECT COUNT(*)
      FROM public.ask_conversation_plan_steps
      WHERE plan_id = NEW.plan_id AND status = 'completed'
    ),
    status = CASE
      WHEN (
        SELECT COUNT(*)
        FROM public.ask_conversation_plan_steps
        WHERE plan_id = NEW.plan_id AND status = 'completed'
      ) >= total_steps THEN 'completed'
      ELSE 'active'
    END,
    updated_at = NOW()
  WHERE id = NEW.plan_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update plan progress when step status changes
CREATE TRIGGER trigger_update_plan_progress
  AFTER UPDATE OF status ON public.ask_conversation_plan_steps
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_plan_progress();

COMMENT ON TRIGGER trigger_update_plan_progress ON public.ask_conversation_plan_steps IS
'Automatically updates plan completed_steps counter and status when a step status changes.';

-- ============================================================
-- Migration complete
-- ============================================================
