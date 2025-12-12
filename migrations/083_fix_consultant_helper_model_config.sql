-- Migration 083: Fix ask-consultant-helper agent model configuration
-- The agent was created without linking to a model configuration
-- This migration links it to the default model

BEGIN;

-- Link the consultant helper agent to the default model configuration
UPDATE public.ai_agents
SET
  model_config_id = (SELECT id FROM public.ai_model_configs WHERE is_default = true LIMIT 1),
  updated_at = NOW()
WHERE slug = 'ask-consultant-helper';

COMMIT;
