-- Migration 102: Sync plan_data.steps to ask_conversation_plan_steps table
-- Some plans have steps in plan_data JSON but not in the normalized table
-- This migration creates the missing step records

BEGIN;

-- Insert missing steps from plan_data into ask_conversation_plan_steps
INSERT INTO ask_conversation_plan_steps (
  id,
  plan_id,
  step_identifier,
  step_order,
  title,
  objective,
  status,
  created_at,
  activated_at
)
SELECT
  gen_random_uuid() as id,
  p.id as plan_id,
  step_data->>'id' as step_identifier,
  (row_number() OVER (PARTITION BY p.id ORDER BY step_data->>'created_at' NULLS LAST))::int as step_order,
  step_data->>'title' as title,
  step_data->>'objective' as objective,
  COALESCE(step_data->>'status', 'pending') as status,
  COALESCE((step_data->>'created_at')::timestamptz, NOW()) as created_at,
  CASE
    WHEN step_data->>'status' IN ('active', 'completed') THEN COALESCE((step_data->>'created_at')::timestamptz, NOW())
    ELSE NULL
  END as activated_at
FROM ask_conversation_plans p
CROSS JOIN LATERAL jsonb_array_elements(p.plan_data->'steps') as step_data
WHERE p.plan_data IS NOT NULL
  AND p.plan_data->'steps' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ask_conversation_plan_steps s
    WHERE s.plan_id = p.id
      AND s.step_identifier = step_data->>'id'
  );

-- Log how many steps were created
DO $$
DECLARE
  created_count integer;
BEGIN
  GET DIAGNOSTICS created_count = ROW_COUNT;
  RAISE NOTICE 'Steps synced from plan_data: %', created_count;
END;
$$;

COMMIT;
