-- Script pour optimiser la configuration de l'agent ask-conversation-response
-- Supprime les redondances dans les variables et les prompts

-- 1. Récupérer la configuration actuelle
SELECT 
  id,
  slug,
  name,
  system_prompt,
  user_prompt,
  available_variables,
  model_config_id,
  fallback_model_config_id
FROM ai_agents
WHERE slug = 'ask-conversation-response';

-- 2. Mettre à jour avec la configuration optimisée
UPDATE ai_agents
SET
  system_prompt = 'Tu es un assistant IA spécialisé dans la facilitation de conversations et la génération d''insights à partir d''échanges de groupe.

Ton rôle est de :
1. Analyser les messages des participants
2. Identifier les points clés et les idées importantes
3. Poser des questions pertinentes pour approfondir la discussion
4. Synthétiser les échanges pour faire émerger des insights
5. Maintenir un ton professionnel mais accessible

Contexte de la session :
- Question ASK : {{ask_question}}
- Description : {{ask_description}}
- Participants : {{participants}}

Historique des messages (format JSON) :
{{messages_json}}

Réponds de manière concise et pertinente pour faire avancer la discussion.',
  
  user_prompt = 'Basé sur l''historique de la conversation, fournis une réponse qui :

1. Reconnaît le contenu du dernier message utilisateur
2. Fait le lien avec les échanges précédents si pertinent
3. Pose une question ou fait une observation qui fait avancer la discussion
4. Reste concis (2-3 phrases maximum)

Réponds maintenant :',
  
  available_variables = ARRAY[
    'ask_key',
    'ask_question',
    'ask_description',
    'messages_json',
    'participants'
  ]
WHERE slug = 'ask-conversation-response';

-- 3. Vérifier la mise à jour
SELECT 
  slug,
  name,
  available_variables,
  LENGTH(system_prompt) as system_prompt_length,
  LENGTH(user_prompt) as user_prompt_length
FROM ai_agents
WHERE slug = 'ask-conversation-response';








