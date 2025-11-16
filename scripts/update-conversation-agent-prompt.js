/**
 * Script pour mettre à jour le prompt de l'agent ask-conversation-response
 * afin qu'il puisse gérer l'initialisation sans messages existants
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateConversationAgentPrompt() {
  console.log('🔧 Updating ask-conversation-response agent prompt...\n');

  try {
    // Récupérer l'agent actuel
    const { data: currentAgent, error: fetchError } = await supabase
      .from('ai_agents')
      .select('id, slug, name')
      .eq('slug', 'ask-conversation-response')
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Erreur lors de la récupération: ${fetchError.message}`);
    }

    if (!currentAgent) {
      throw new Error('Agent ask-conversation-response introuvable');
    }

    console.log(`📋 Agent trouvé: ${currentAgent.name} (${currentAgent.id})\n`);

    // Nouveau prompt système qui gère l'initialisation ET la conversation
    const newSystemPrompt = `Tu es un assistant IA spécialisé dans la facilitation de conversations et la génération d'insights à partir d'échanges de groupe.

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

    // Nouveau user prompt qui gère l'initialisation
    const newUserPrompt = `Si l'historique de conversation est vide (tableau JSON vide []), génère un message d'accueil qui :
1. Introduit brièvement le sujet de la session (basé sur la question ASK)
2. Invite les participants à partager leurs réflexions
3. Reste concis (2-3 phrases maximum)

Si l'historique contient des messages, fournis une réponse qui :
1. Reconnaît le contenu du dernier message utilisateur
2. Fait le lien avec les échanges précédents si pertinent
3. Pose une question ou fait une observation qui fait avancer la discussion
4. Reste concis (2-3 phrases maximum)

Réponds maintenant :`;

    // Mettre à jour l'agent
    const { error: updateError } = await supabase
      .from('ai_agents')
      .update({
        system_prompt: newSystemPrompt,
        user_prompt: newUserPrompt,
      })
      .eq('slug', 'ask-conversation-response');

    if (updateError) {
      throw new Error(`Erreur lors de la mise à jour: ${updateError.message}`);
    }

    console.log('✅ Prompt mis à jour avec succès!\n');
    console.log('📝 Changements appliqués:');
    console.log('  - System prompt: Inchangé (déjà compatible)');
    console.log('  - User prompt: Mis à jour pour gérer l\'initialisation');
    console.log('');
    console.log('🎯 L\'agent peut maintenant:');
    console.log('  1. Générer un message d\'accueil quand messages_json est []');
    console.log('  2. Répondre normalement quand il y a des messages existants');
    console.log('');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

updateConversationAgentPrompt();

