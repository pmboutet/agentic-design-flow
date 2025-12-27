-- Migration: Create RPC functions for conversation plan creation
-- Purpose: Bypass RLS issues when creating plans in production
-- These functions use SECURITY DEFINER to execute with owner privileges

-- Create RPC function to create conversation plan (bypasses RLS)
CREATE OR REPLACE FUNCTION public.create_conversation_plan(
  p_conversation_thread_id uuid,
  p_plan_data jsonb,
  p_current_step_id text,
  p_total_steps integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  INSERT INTO ask_conversation_plans (
    conversation_thread_id,
    plan_data,
    current_step_id,
    total_steps,
    completed_steps,
    status
  ) VALUES (
    p_conversation_thread_id,
    p_plan_data,
    p_current_step_id,
    p_total_steps,
    0,
    'active'
  )
  RETURNING id INTO v_plan_id;

  RETURN v_plan_id;
END;
$$;

-- Create RPC function to create plan steps (bypasses RLS)
CREATE OR REPLACE FUNCTION public.create_conversation_plan_steps(
  p_plan_id uuid,
  p_steps jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step record;
  v_inserted_ids jsonb := '[]'::jsonb;
  v_step_id uuid;
  v_now timestamptz := NOW();
BEGIN
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps)
  LOOP
    INSERT INTO ask_conversation_plan_steps (
      plan_id,
      step_identifier,
      step_order,
      title,
      objective,
      status,
      activated_at
    ) VALUES (
      p_plan_id,
      v_step.value->>'step_identifier',
      (v_step.value->>'step_order')::integer,
      v_step.value->>'title',
      v_step.value->>'objective',
      v_step.value->>'status',
      CASE WHEN v_step.value->>'status' = 'active' THEN v_now ELSE NULL END
    )
    RETURNING id INTO v_step_id;

    v_inserted_ids := v_inserted_ids || jsonb_build_object('id', v_step_id, 'step_identifier', v_step.value->>'step_identifier');
  END LOOP;

  RETURN v_inserted_ids;
END;
$$;

-- Grant execute to all roles
GRANT EXECUTE ON FUNCTION public.create_conversation_plan TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_conversation_plan_steps TO anon, authenticated, service_role;

-- Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
