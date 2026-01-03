-- Migration 121: Add project/challenge context variables to all AI agents
-- This migration adds the new variables AND appends a CONTEXTE section to prompts

-- =====================================================
-- STEP 1: Add variables to agents that need ALL 4 context variables
-- =====================================================

UPDATE ai_agents
SET
  available_variables = array_cat(
    COALESCE(available_variables, ARRAY[]::TEXT[]),
    ARRAY['project_name', 'project_description', 'challenge_name', 'challenge_description']::TEXT[]
  ),
  updated_at = NOW()
WHERE slug IN (
  'ask-conversation-response',
  'ask-conversation-plan-generator',
  'ask-consultant-helper',
  'ask-conversation-step-summarizer',
  'ask-insight-detection',
  'ask-generator'
)
AND NOT (available_variables @> ARRAY['project_name', 'project_description', 'challenge_name', 'challenge_description']::TEXT[]);

-- =====================================================
-- STEP 2: Add variables to agents that only need project context
-- =====================================================

UPDATE ai_agents
SET
  available_variables = array_cat(
    COALESCE(available_variables, ARRAY[]::TEXT[]),
    ARRAY['project_name', 'project_description']::TEXT[]
  ),
  updated_at = NOW()
WHERE slug IN (
  'challenge-revision-planner',
  'challenge-detailed-updater',
  'challenge-detailed-creator',
  'insight-claim-extraction'
)
AND NOT (available_variables @> ARRAY['project_name', 'project_description']::TEXT[]);

-- =====================================================
-- STEP 3: Append CONTEXTE section to system prompts
-- Only if not already present
-- =====================================================

-- Context section to append (with project + challenge)
DO $$
DECLARE
  context_section TEXT := E'

## CONTEXTE

{{#if project_name}}
**Projet:** {{project_name}}
{{#if project_description}}
{{project_description}}
{{/if}}
{{/if}}

{{#if challenge_name}}
**Challenge:** {{challenge_name}}
{{#if challenge_description}}
{{challenge_description}}
{{/if}}
{{/if}}';

  context_section_project_only TEXT := E'

## CONTEXTE PROJET

{{#if project_name}}
**Projet:** {{project_name}}
{{#if project_description}}
{{project_description}}
{{/if}}
{{/if}}';

BEGIN
  -- Agents with full context (project + challenge)
  UPDATE ai_agents
  SET
    system_prompt = system_prompt || context_section,
    updated_at = NOW()
  WHERE slug IN (
    'ask-conversation-response',
    'ask-conversation-plan-generator',
    'ask-consultant-helper',
    'ask-insight-detection',
    'ask-generator'
  )
  AND system_prompt NOT LIKE '%## CONTEXTE%';

  -- Agents with project-only context
  UPDATE ai_agents
  SET
    system_prompt = system_prompt || context_section_project_only,
    updated_at = NOW()
  WHERE slug IN (
    'challenge-revision-planner',
    'challenge-detailed-updater',
    'challenge-detailed-creator',
    'insight-claim-extraction'
  )
  AND system_prompt NOT LIKE '%## CONTEXTE%';
END $$;

-- =====================================================
NOTIFY pgrst, 'reload schema';
