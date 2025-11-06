/**
 * Script pour optimiser la configuration de l'agent ask-conversation-response
 * Supprime les redondances dans les variables et les prompts
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function optimizeAskConversationAgent() {
  console.log('🔧 Optimisation de l\'agent ask-conversation-response...\n');

  try {
    // 1. Récupérer la configuration actuelle
    const { data: currentAgent, error: fetchError } = await supabase
      .from('ai_agents')
      .select('id, slug, name, system_prompt, user_prompt, available_variables')
      .eq('slug', 'ask-conversation-response')
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Erreur lors de la récupération: ${fetchError.message}`);
    }

    if (!currentAgent) {
      throw new Error('Agent ask-conversation-response introuvable');
    }

    console.log('📋 Configuration actuelle:');
    console.log(`  - Variables disponibles: ${currentAgent.available_variables?.join(', ') || 'aucune'}`);
    console.log(`  - Longueur system_prompt: ${currentAgent.system_prompt?.length || 0} caractères`);
    console.log(`  - Longueur user_prompt: ${currentAgent.user_prompt?.length || 0} caractères\n`);

    // 2. Configuration optimisée
    const optimizedSystemPrompt = `Tu es un assistant IA spécialisé dans la facilitation de conversations et la génération d'insights à partir d'échanges de groupe.

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

Réponds de manière concise et pertinente pour faire avancer la discussion.`;

    const optimizedUserPrompt = `Basé sur l'historique de la conversation, fournis une réponse qui :

1. Reconnaît le contenu du dernier message utilisateur
2. Fait le lien avec les échanges précédents si pertinent
3. Pose une question ou fait une observation qui fait avancer la discussion
4. Reste concis (2-3 phrases maximum)

Réponds maintenant :`;

    const optimizedVariables = [
      'ask_key',
      'ask_question',
      'ask_description',
      'messages_json',
      'participants'
    ];

    // 3. Mettre à jour la configuration
    const { data: updatedAgent, error: updateError } = await supabase
      .from('ai_agents')
      .update({
        system_prompt: optimizedSystemPrompt,
        user_prompt: optimizedUserPrompt,
        available_variables: optimizedVariables,
      })
      .eq('slug', 'ask-conversation-response')
      .select('id, slug, name, system_prompt, user_prompt, available_variables')
      .single();

    if (updateError) {
      throw new Error(`Erreur lors de la mise à jour: ${updateError.message}`);
    }

    console.log('✅ Configuration optimisée avec succès!\n');
    console.log('📋 Nouvelle configuration:');
    console.log(`  - Variables disponibles: ${updatedAgent.available_variables?.join(', ') || 'aucune'}`);
    console.log(`  - Longueur system_prompt: ${updatedAgent.system_prompt?.length || 0} caractères`);
    console.log(`  - Longueur user_prompt: ${updatedAgent.user_prompt?.length || 0} caractères\n`);

    console.log('📊 Résumé des optimisations:');
    console.log('  ✅ Suppression de message_history (remplacé par messages_json)');
    console.log('  ✅ Suppression de previous_messages (redondant)');
    console.log('  ✅ Suppression de latest_user_message (déjà dans messages_json)');
    console.log('  ✅ Suppression de participant_name (redondant avec participants)');
    console.log('  ✅ Suppression de participants_count (redondant avec participants)');
    console.log('  ✅ Suppression de current_timestamp (inutile)');
    console.log('  ✅ Utilisation de messages_json pour un format structuré et complet\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

optimizeAskConversationAgent();

