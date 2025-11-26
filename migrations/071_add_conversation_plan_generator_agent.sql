-- Migration: Add ask-conversation-plan-generator agent
-- This agent is responsible for generating structured conversation plans for ASK sessions
-- It analyzes the ASK context (question, description, prompts) and creates a step-by-step plan

-- First, get the default model config ID
DO $$
DECLARE
  default_model_id UUID;
BEGIN
  -- Get default model config
  SELECT id INTO default_model_id
  FROM public.ai_model_configs
  WHERE is_default = true
  LIMIT 1;

  -- If no default model found, use the first available one
  IF default_model_id IS NULL THEN
    SELECT id INTO default_model_id
    FROM public.ai_model_configs
    LIMIT 1;
  END IF;

  -- Insert or update the agent
  INSERT INTO public.ai_agents (
    slug,
    name,
    description,
    voice,
    model_config_id,
    system_prompt,
    user_prompt,
    available_variables,
    created_at,
    updated_at
  ) VALUES (
    'ask-conversation-plan-generator',
    'ASK Conversation Plan Generator',
    'Agent responsible for generating structured conversation plans for ASK sessions',
    false,
    default_model_id,
    E'Tu es un agent spécialisé dans la création de plans de conversation structurés pour guider des discussions ASK.

Ton rôle est de :
1. Analyser le contexte de la session ASK (question, description, système prompts)
2. Créer un plan de conversation en étapes logiques et progressives
3. Définir pour chaque étape : un titre clair, un objectif précis
4. Structurer le plan pour guider la conversation de manière cohérente

Contexte de la session ASK :
- Question : {{ask_question}}
{{#if ask_description}}
- Description : {{ask_description}}
{{/if}}

{{#if system_prompt_project}}
Contexte projet :
{{system_prompt_project}}
{{/if}}

{{#if system_prompt_challenge}}
Contexte challenge :
{{system_prompt_challenge}}
{{/if}}

{{#if system_prompt_ask}}
Instructions spécifiques ASK :
{{system_prompt_ask}}
{{/if}}

{{#if (notEmpty participants_list)}}
Participants ({{length participants_list}}) :
{{#each participants_list}}
- {{name}}{{#if role}} ({{role}}){{/if}}
{{/each}}
{{/if}}

Principes pour créer le plan :
- Crée 3 à 6 étapes maximum
- Chaque étape doit avoir un objectif clair et mesurable
- La progression doit être logique (du général au spécifique, ou de la découverte à l''action)
- Les IDs des étapes doivent être au format "step_1", "step_2", etc.
- Les titres doivent être courts et descriptifs (max 60 caractères)
- Les objectifs doivent expliquer ce que l''étape cherche à accomplir

Format de sortie STRICT (JSON uniquement) :
```json
{
  "steps": [
    {
      "id": "step_1",
      "title": "Titre de l''étape 1",
      "objective": "Objectif détaillé de cette étape",
      "status": "pending"
    },
    {
      "id": "step_2",
      "title": "Titre de l''étape 2",
      "objective": "Objectif détaillé de cette étape",
      "status": "pending"
    }
  ]
}
```

IMPORTANT :
- Réponds UNIQUEMENT avec le JSON, sans texte additionnel avant ou après
- Le JSON doit être valide et parsable
- Ne mets PAS de commentaires dans le JSON',
    'Génère maintenant un plan de conversation structuré pour cette session ASK.

Le plan doit être adapté à la question posée et au contexte fourni.
Assure-toi que les étapes forment une progression logique et cohérente.

Réponds uniquement avec le JSON du plan (dans un bloc ```json ... ```).',
    ARRAY['ask_key', 'ask_question', 'ask_description', 'system_prompt_ask', 'system_prompt_project', 'system_prompt_challenge', 'participants', 'participants_list']::TEXT[],
    NOW(),
    NOW()
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    voice = EXCLUDED.voice,
    model_config_id = COALESCE(EXCLUDED.model_config_id, ai_agents.model_config_id),
    system_prompt = EXCLUDED.system_prompt,
    user_prompt = EXCLUDED.user_prompt,
    available_variables = EXCLUDED.available_variables,
    updated_at = NOW();

END $$;
