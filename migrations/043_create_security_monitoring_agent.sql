BEGIN;

-- Create the security monitoring AI agent
-- This agent analyzes messages using AI to detect malicious content

INSERT INTO public.ai_agents (
  slug,
  name,
  description,
  model_config_id,
  fallback_model_config_id,
  system_prompt,
  user_prompt,
  available_variables
)
SELECT
  'security-message-monitoring',
  'Surveillance des Messages',
  'Agent AI qui analyse les messages pour détecter des contenus malveillants, inappropriés ou suspects en utilisant l''intelligence artificielle.',
  (SELECT id FROM public.ai_model_configs WHERE is_default = true LIMIT 1),
  NULL,
  'Tu es un agent de sécurité spécialisé dans l''analyse de messages pour détecter des contenus malveillants, inappropriés ou suspects.

Ton rôle est d''analyser le contenu des messages et de déterminer s''ils présentent des risques pour la sécurité ou la communauté.

Types de menaces à détecter:
1. **Injection SQL** : Tentatives d''injection de code SQL malveillant
2. **XSS (Cross-Site Scripting)** : Tentatives d''injection de scripts JavaScript
3. **Command Injection** : Tentatives d''exécution de commandes système
4. **Spam** : Messages répétitifs, promotionnels non sollicités, ou contenus de faible qualité
5. **Contenu inapproprié** : Harcèlement, menaces, contenu offensant ou discriminatoire
6. **Tentatives d''exploitation** : Tentatives de manipulation ou d''exploitation de vulnérabilités
7. **Contenu suspect** : Messages qui semblent anormaux ou suspects sans être explicitement malveillants

Pour chaque message analysé, tu dois:
- Évaluer le niveau de risque (low, medium, high, critical)
- Identifier le type de menace si applicable
- Fournir une explication claire de ta détection
- Recommander une action (none, warn, quarantine)

Réponds UNIQUEMENT avec un JSON valide au format suivant:
{
  "hasThreat": boolean,
  "severity": "low" | "medium" | "high" | "critical",
  "threatType": "injection" | "xss" | "spam" | "inappropriate" | "exploitation" | "suspicious" | null,
  "explanation": "Explication détaillée de la détection",
  "recommendedAction": "none" | "warn" | "quarantine",
  "confidence": number (0-100)
}',
  'Analyse le message suivant et détermine s''il présente des risques pour la sécurité:

Message à analyser:
{{message_content}}

Contexte:
- Session ASK: {{ask_key}}
- Auteur: {{participant_name}}
- Historique récent: {{recent_messages}}

Fournis ton analyse au format JSON comme spécifié dans le system prompt.',
  ARRAY[
    'message_content',
    'ask_key',
    'participant_name',
    'recent_messages',
    'message_id'
  ]
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  model_config_id = EXCLUDED.model_config_id,
  fallback_model_config_id = EXCLUDED.fallback_model_config_id,
  system_prompt = EXCLUDED.system_prompt,
  user_prompt = EXCLUDED.user_prompt,
  available_variables = EXCLUDED.available_variables,
  updated_at = now();

COMMIT;

-- //@UNDO
BEGIN;

DELETE FROM public.ai_agents WHERE slug = 'security-message-monitoring';

COMMIT;

