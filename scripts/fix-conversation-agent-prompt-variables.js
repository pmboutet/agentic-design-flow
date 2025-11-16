/**
 * Script pour ajouter les variables system_prompt_ask, system_prompt_project, system_prompt_challenge
 * au prompt de l'agent ask-conversation-response
 * 
 * BUG CORRIGÉ : Le system_prompt de l'ASK ne doit PAS remplacer le prompt de l'agent.
 * Il doit être fourni comme variable {{system_prompt_ask}} qui est substituée dans le prompt de l'agent.
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
  console.log('🔧 Ajout des variables system_prompt_* au prompt de ask-conversation-response...\n');

  try {
    // Récupérer l'agent actuel
    const { data: currentAgent, error: fetchError } = await supabase
      .from('ai_agents')
      .select('id, slug, name, system_prompt, user_prompt')
      .eq('slug', 'ask-conversation-response')
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Erreur lors de la récupération: ${fetchError.message}`);
    }

    if (!currentAgent) {
      throw new Error('Agent ask-conversation-response introuvable');
    }

    console.log(`📋 Agent trouvé: ${currentAgent.name} (${currentAgent.id})\n`);

    // Nouveau prompt système qui INCLUT les variables system_prompt_*
    const newSystemPrompt = `Tu es un assistant IA spécialisé dans la facilitation de conversations et la génération d'insights à partir d'échanges de groupe.

Ton rôle est de :
1. Analyser les messages des participants
2. Identifier les points clés et les idées importantes
3. Poser des questions pertinentes pour approfondir la discussion
4. Synthétiser les échanges pour faire émerger des insights
5. Maintenir un ton professionnel mais accessible

{{system_prompt_ask}}

Contexte de la session :
- Question ASK : {{ask_question}}
- Description : {{ask_description}}
- Participants : {{participants}}

System prompt projet : {{system_prompt_project}}
System prompt challenge : {{system_prompt_challenge}}

Historique des messages (format JSON) :
{{messages_json}}

Réponds de manière concise et pertinente pour faire avancer la discussion.`;

    // User prompt inchangé
    const newUserPrompt = currentAgent.user_prompt || `Si l'historique de conversation est vide (tableau JSON vide []), génère un message d'accueil qui :
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
    console.log('  - System prompt: Ajout de {{system_prompt_ask}}, {{system_prompt_project}}, {{system_prompt_challenge}}');
    console.log('  - User prompt: Inchangé');
    console.log('');
    console.log('🎯 Comportement corrigé:');
    console.log('  - Le system_prompt de l\'ASK ne remplace PLUS le prompt de l\'agent');
    console.log('  - Il est maintenant fourni comme variable {{system_prompt_ask}}');
    console.log('  - Même chose pour les system_prompt du projet et du challenge');
    console.log('  - L\'agent conserve toujours son prompt de base');
    console.log('');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

updateConversationAgentPrompt();

