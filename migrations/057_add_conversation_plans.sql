-- Migration 057: Add conversation plans for guided ASK conversations
-- This adds a system to guide conversations through structured steps

BEGIN;

-- Create conversation plans table
CREATE TABLE IF NOT EXISTS public.ask_conversation_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_thread_id UUID NOT NULL REFERENCES public.conversation_threads(id) ON DELETE CASCADE,
  plan_data JSONB NOT NULL, -- Stores the complete plan structure with steps
  current_step_id VARCHAR(100), -- ID of the current active step
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_thread_id) -- One plan per conversation thread
);

-- Create index for faster lookups by thread
CREATE INDEX IF NOT EXISTS idx_conversation_plans_thread_id 
  ON public.ask_conversation_plans (conversation_thread_id);

-- Create index for faster lookups by current step
CREATE INDEX IF NOT EXISTS idx_conversation_plans_current_step 
  ON public.ask_conversation_plans (current_step_id) 
  WHERE current_step_id IS NOT NULL;

-- Add comment to describe the plan_data structure
COMMENT ON COLUMN public.ask_conversation_plans.plan_data IS 
'JSON structure containing steps array with: id, title, objective, status (pending/active/completed/skipped), summary, created_at, completed_at';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_conversation_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_conversation_plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_conversation_plans TO anon;

-- Enable RLS
ALTER TABLE public.ask_conversation_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role has full access
CREATE POLICY "Service role has full access to conversation plans"
  ON public.ask_conversation_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can access plans for their threads
CREATE POLICY "Users can view conversation plans for their threads"
  ON public.ask_conversation_plans
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_threads ct
      WHERE ct.id = conversation_thread_id
        AND (ct.user_id = auth.uid() OR ct.is_shared = true)
    )
  );

-- Authenticated users can create plans for their threads
CREATE POLICY "Users can create conversation plans for their threads"
  ON public.ask_conversation_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_threads ct
      WHERE ct.id = conversation_thread_id
        AND (ct.user_id = auth.uid() OR ct.is_shared = true)
    )
  );

-- Authenticated users can update plans for their threads
CREATE POLICY "Users can update conversation plans for their threads"
  ON public.ask_conversation_plans
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_threads ct
      WHERE ct.id = conversation_thread_id
        AND (ct.user_id = auth.uid() OR ct.is_shared = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_threads ct
      WHERE ct.id = conversation_thread_id
        AND (ct.user_id = auth.uid() OR ct.is_shared = true)
    )
  );

-- Anonymous users can access plans for shared threads (for anonymous ASK sessions)
CREATE POLICY "Anonymous users can view conversation plans for shared threads"
  ON public.ask_conversation_plans
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_threads ct
      WHERE ct.id = conversation_thread_id
        AND ct.is_shared = true
    )
  );

CREATE POLICY "Anonymous users can create conversation plans for shared threads"
  ON public.ask_conversation_plans
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_threads ct
      WHERE ct.id = conversation_thread_id
        AND ct.is_shared = true
    )
  );

CREATE POLICY "Anonymous users can update conversation plans for shared threads"
  ON public.ask_conversation_plans
  FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_threads ct
      WHERE ct.id = conversation_thread_id
        AND ct.is_shared = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_threads ct
      WHERE ct.id = conversation_thread_id
        AND ct.is_shared = true
    )
  );

COMMIT;

-- //@UNDO
BEGIN;

DROP POLICY IF EXISTS "Anonymous users can update conversation plans for shared threads" ON public.ask_conversation_plans;
DROP POLICY IF EXISTS "Anonymous users can create conversation plans for shared threads" ON public.ask_conversation_plans;
DROP POLICY IF EXISTS "Anonymous users can view conversation plans for shared threads" ON public.ask_conversation_plans;
DROP POLICY IF EXISTS "Users can update conversation plans for their threads" ON public.ask_conversation_plans;
DROP POLICY IF EXISTS "Users can create conversation plans for their threads" ON public.ask_conversation_plans;
DROP POLICY IF EXISTS "Users can view conversation plans for their threads" ON public.ask_conversation_plans;
DROP POLICY IF EXISTS "Service role has full access to conversation plans" ON public.ask_conversation_plans;

DROP INDEX IF EXISTS idx_conversation_plans_current_step;
DROP INDEX IF EXISTS idx_conversation_plans_thread_id;

DROP TABLE IF EXISTS public.ask_conversation_plans CASCADE;

COMMIT;

