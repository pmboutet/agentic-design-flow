-- Script complet pour résoudre l'erreur 500
-- 1. D'abord, exécuter la migration pour ajouter les colonnes manquantes
-- 2. Ensuite, configurer les données nécessaires

-- ========================================
-- ÉTAPE 1: MIGRATION - Ajouter les colonnes manquantes
-- ========================================

-- Ajouter les colonnes manquantes à ask_sessions
ALTER TABLE ask_sessions 
ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(20) DEFAULT 'digital',
ADD COLUMN IF NOT EXISTS audience_scope VARCHAR(20) DEFAULT 'individual', 
ADD COLUMN IF NOT EXISTS response_mode VARCHAR(20) DEFAULT 'collective';

-- Ajouter la colonne is_spokesperson à ask_participants si elle n'existe pas
ALTER TABLE ask_participants 
ADD COLUMN IF NOT EXISTS is_spokesperson BOOLEAN DEFAULT false;

-- Mettre à jour les sessions existantes avec des valeurs par défaut appropriées
UPDATE ask_sessions 
SET 
  delivery_mode = COALESCE(delivery_mode, 'digital'),
  audience_scope = COALESCE(audience_scope, 
    CASE 
      WHEN max_participants = 1 OR max_participants IS NULL THEN 'individual' 
      ELSE 'group' 
    END),
  response_mode = COALESCE(response_mode, 'collective')
WHERE delivery_mode IS NULL OR audience_scope IS NULL OR response_mode IS NULL;

-- Ajouter des contraintes pour s'assurer que les valeurs sont valides
ALTER TABLE ask_sessions 
ADD CONSTRAINT IF NOT EXISTS check_delivery_mode 
CHECK (delivery_mode IN ('digital', 'physical'));

ALTER TABLE ask_sessions 
ADD CONSTRAINT IF NOT EXISTS check_audience_scope 
CHECK (audience_scope IN ('individual', 'group'));

ALTER TABLE ask_sessions 
ADD CONSTRAINT IF NOT EXISTS check_response_mode 
CHECK (response_mode IN ('collective', 'simultaneous'));

-- ========================================
-- ÉTAPE 2: CONFIGURATION IA
-- ========================================

-- Configuration du modèle IA par défaut
INSERT INTO ai_model_configs (
  id,
  code,
  name,
  provider,
  model,
  api_key_env_var,
  base_url,
  is_default,
  is_fallback
) VALUES (
  '550e8400-e29b-41d4-a716-446655440061',
  'anthropic-claude-sonnet-4-5',
  'Claude Sonnet 4.5',
  'anthropic',
  'claude-sonnet-4-5',
  'ANTHROPIC_API_KEY',
  'https://api.anthropic.com/v1',
  true,
  false
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  api_key_env_var = EXCLUDED.api_key_env_var,
  base_url = EXCLUDED.base_url,
  is_default = EXCLUDED.is_default,
  is_fallback = EXCLUDED.is_fallback;

-- Agent IA pour les conversations
INSERT INTO ai_agents (
  id,
  slug,
  name,
  description,
  model_config_id,
  system_prompt,
  user_prompt,
  available_variables
) VALUES (
  '550e8400-e29b-41d4-a716-446655440063',
  'ask-conversation-response',
  'ASK Conversation Response Agent',
  'Agent responsible for generating conversational responses in ASK sessions',
  '550e8400-e29b-41d4-a716-446655440061',
  'Tu es un assistant IA spécialisé dans la facilitation de conversations et la génération d''insights à partir d''échanges de groupe.

Ton rôle est de :
1. Analyser les messages des participants
2. Identifier les points clés et les idées importantes
3. Poser des questions pertinentes pour approfondir la discussion
4. Synthétiser les échanges pour faire émerger des insights
5. Maintenir un ton professionnel mais accessible

Réponds de manière concise et pertinente pour faire avancer la discussion.',
  'Basé sur l''historique de la conversation et le dernier message de l''utilisateur, fournis une réponse qui :

1. Reconnaît le contenu du dernier message
2. Fait le lien avec les échanges précédents si pertinent
3. Pose une question ou fait une observation qui fait avancer la discussion
4. Reste concis (2-3 phrases maximum)

Réponds maintenant :',
  ARRAY[
    'ask_key',
    'ask_question',
    'ask_description',
    'message_history',
    'latest_user_message',
    'participants',
    'participant_name'
  ]
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  model_config_id = EXCLUDED.model_config_id,
  system_prompt = EXCLUDED.system_prompt,
  user_prompt = EXCLUDED.user_prompt,
  available_variables = EXCLUDED.available_variables;

-- ========================================
-- ÉTAPE 3: SESSION ASK DE TEST
-- ========================================

-- Session ASK de test avec la clé "123"
INSERT INTO ask_sessions (
  id,
  ask_key,
  name,
  question,
  description,
  start_date,
  end_date,
  status,
  delivery_mode,
  audience_scope,
  response_mode
) VALUES (
  '550e8400-e29b-41d4-a716-446655440041',
  '123',
  'Test ASK Session',
  'What are the main challenges in our current workflow?',
  'A test session to debug the streaming issue',
  NOW(),
  NOW() + INTERVAL '7 days',
  'active',
  'digital',
  'individual',
  'collective'
) ON CONFLICT (ask_key) DO UPDATE SET
  name = EXCLUDED.name,
  question = EXCLUDED.question,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  delivery_mode = EXCLUDED.delivery_mode,
  audience_scope = EXCLUDED.audience_scope,
  response_mode = EXCLUDED.response_mode;

-- Participant pour la session ASK
INSERT INTO ask_participants (
  id,
  ask_session_id,
  participant_name,
  role,
  is_spokesperson
) VALUES (
  '550e8400-e29b-41d4-a716-446655440051',
  '550e8400-e29b-41d4-a716-446655440041',
  'Test User',
  'participant',
  true
) ON CONFLICT (id) DO UPDATE SET
  participant_name = EXCLUDED.participant_name,
  role = EXCLUDED.role,
  is_spokesperson = EXCLUDED.is_spokesperson;

-- Message initial pour tester
INSERT INTO messages (
  id,
  ask_session_id,
  sender_type,
  content,
  message_type
) VALUES (
  '550e8400-e29b-41d4-a716-446655440071',
  '550e8400-e29b-41d4-a716-446655440041',
  'user',
  'Hello, I need help with our workflow optimization.',
  'text'
) ON CONFLICT (id) DO NOTHING;

-- ========================================
-- VÉRIFICATION
-- ========================================

-- Vérification des données insérées
SELECT 'ai_model_configs' as table_name, count(*) as count FROM ai_model_configs
UNION ALL
SELECT 'ai_agents' as table_name, count(*) as count FROM ai_agents
UNION ALL
SELECT 'ask_sessions' as table_name, count(*) as count FROM ask_sessions
UNION ALL
SELECT 'ask_participants' as table_name, count(*) as count FROM ask_participants
UNION ALL
SELECT 'messages' as table_name, count(*) as count FROM messages;

-- Vérifier que la session ASK "123" existe
SELECT ask_key, name, status, delivery_mode, audience_scope, response_mode 
FROM ask_sessions 
WHERE ask_key = '123';
