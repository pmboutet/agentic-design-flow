-- Migration: Create RPC functions to bypass RLS in production
-- Purpose: The service_role client doesn't properly bypass RLS in Vercel production
-- All these functions use SECURITY DEFINER to execute with owner privileges

-- =====================================================
-- MESSAGE RPCs
-- =====================================================

-- Insert AI message
CREATE OR REPLACE FUNCTION public.insert_ai_message(
  p_ask_session_id uuid,
  p_conversation_thread_id uuid,
  p_content text,
  p_sender_name text DEFAULT 'Agent'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_record messages;
BEGIN
  INSERT INTO messages (
    ask_session_id,
    conversation_thread_id,
    content,
    sender_type,
    message_type,
    metadata
  ) VALUES (
    p_ask_session_id,
    p_conversation_thread_id,
    p_content,
    'ai',
    'text',
    jsonb_build_object('senderName', p_sender_name)
  )
  RETURNING * INTO v_message_record;

  RETURN to_jsonb(v_message_record);
END;
$$;

-- =====================================================
-- PLAN STEP RPCs
-- =====================================================

-- Update step summary
CREATE OR REPLACE FUNCTION public.update_plan_step_summary(
  p_step_id uuid,
  p_summary text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step_record ask_conversation_plan_steps;
BEGIN
  UPDATE ask_conversation_plan_steps
  SET summary = p_summary
  WHERE id = p_step_id
  RETURNING * INTO v_step_record;

  RETURN to_jsonb(v_step_record);
END;
$$;

-- Complete a step
CREATE OR REPLACE FUNCTION public.complete_plan_step(
  p_step_id uuid,
  p_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step_record ask_conversation_plan_steps;
BEGIN
  UPDATE ask_conversation_plan_steps
  SET
    status = 'completed',
    completed_at = NOW(),
    summary = COALESCE(p_summary, summary)
  WHERE id = p_step_id
  RETURNING * INTO v_step_record;

  RETURN to_jsonb(v_step_record);
END;
$$;

-- Activate a step
CREATE OR REPLACE FUNCTION public.activate_plan_step(
  p_step_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step_record ask_conversation_plan_steps;
BEGIN
  UPDATE ask_conversation_plan_steps
  SET
    status = 'active',
    activated_at = NOW()
  WHERE id = p_step_id
  RETURNING * INTO v_step_record;

  RETURN to_jsonb(v_step_record);
END;
$$;

-- Update plan current step
CREATE OR REPLACE FUNCTION public.update_plan_current_step(
  p_plan_id uuid,
  p_current_step_id text,
  p_completed_steps integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_record ask_conversation_plans;
BEGIN
  UPDATE ask_conversation_plans
  SET
    current_step_id = p_current_step_id,
    completed_steps = COALESCE(p_completed_steps, completed_steps),
    updated_at = NOW()
  WHERE id = p_plan_id
  RETURNING * INTO v_plan_record;

  RETURN to_jsonb(v_plan_record);
END;
$$;

-- =====================================================
-- INSIGHT RPCs
-- =====================================================

-- Insert insight
CREATE OR REPLACE FUNCTION public.insert_insight(
  p_ask_session_id uuid,
  p_content text,
  p_summary text DEFAULT NULL,
  p_insight_type text DEFAULT 'pain',
  p_status text DEFAULT 'draft',
  p_source_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insight_record insights;
BEGIN
  INSERT INTO insights (
    ask_session_id,
    content,
    summary,
    insight_type,
    status,
    source_message_id
  ) VALUES (
    p_ask_session_id,
    p_content,
    p_summary,
    p_insight_type,
    p_status,
    p_source_message_id
  )
  RETURNING * INTO v_insight_record;

  RETURN to_jsonb(v_insight_record);
END;
$$;

-- Update insight
CREATE OR REPLACE FUNCTION public.update_insight(
  p_insight_id uuid,
  p_content text DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_insight_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insight_record insights;
BEGIN
  UPDATE insights
  SET
    content = COALESCE(p_content, content),
    summary = COALESCE(p_summary, summary),
    status = COALESCE(p_status, status),
    insight_type = COALESCE(p_insight_type, insight_type),
    updated_at = NOW()
  WHERE id = p_insight_id
  RETURNING * INTO v_insight_record;

  RETURN to_jsonb(v_insight_record);
END;
$$;

-- =====================================================
-- PLAN FETCH RPCs
-- =====================================================

-- Get conversation plan with steps
CREATE OR REPLACE FUNCTION public.get_conversation_plan_with_steps(
  p_conversation_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_record ask_conversation_plans;
  v_steps jsonb;
BEGIN
  -- Get the plan
  SELECT * INTO v_plan_record
  FROM ask_conversation_plans
  WHERE conversation_thread_id = p_conversation_thread_id;

  IF v_plan_record IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get the steps
  SELECT jsonb_agg(row_to_json(s.*)::jsonb ORDER BY s.step_order)
  INTO v_steps
  FROM ask_conversation_plan_steps s
  WHERE s.plan_id = v_plan_record.id;

  -- Return plan with steps
  RETURN jsonb_build_object(
    'plan', to_jsonb(v_plan_record),
    'steps', COALESCE(v_steps, '[]'::jsonb)
  );
END;
$$;

-- =====================================================
-- PARTICIPANT RPCs
-- =====================================================

-- Get participant by ID
CREATE OR REPLACE FUNCTION public.get_participant_by_id(
  p_participant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_record ask_participants;
BEGIN
  SELECT * INTO v_participant_record
  FROM ask_participants
  WHERE id = p_participant_id;

  IF v_participant_record IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_participant_record);
END;
$$;

-- =====================================================
-- GRANTS
-- =====================================================

GRANT EXECUTE ON FUNCTION public.insert_ai_message TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_plan_step_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_plan_step TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_plan_step TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_plan_current_step TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_insight TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_insight TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_conversation_plan_with_steps TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_participant_by_id TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
