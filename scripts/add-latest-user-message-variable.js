/**
 * Script pour ajouter latest_user_message aux available_variables
 * de l'agent ask-conversation-response
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

async function addLatestUserMessageVariable() {
  console.log('🔧 Adding latest_user_message to ask-conversation-response available_variables...\n');

  try {
    // Récupérer l'agent actuel
    const { data: currentAgent, error: fetchError } = await supabase
      .from('ai_agents')
      .select('id, slug, name, available_variables')
      .eq('slug', 'ask-conversation-response')
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Erreur lors de la récupération: ${fetchError.message}`);
    }

    if (!currentAgent) {
      throw new Error('Agent ask-conversation-response introuvable');
    }

    console.log(`📋 Agent trouvé: ${currentAgent.name} (${currentAgent.id})\n`);
    console.log('Available variables actuelles:', currentAgent.available_variables);

    // Vérifier si latest_user_message est déjà présent
    const availableVariables = Array.isArray(currentAgent.available_variables) 
      ? currentAgent.available_variables 
      : [];

    if (availableVariables.includes('latest_user_message')) {
      console.log('✅ latest_user_message est déjà dans available_variables');
      return;
    }

    // Ajouter latest_user_message
    const updatedVariables = [...availableVariables, 'latest_user_message'];

    const { error: updateError } = await supabase
      .from('ai_agents')
      .update({
        available_variables: updatedVariables,
      })
      .eq('slug', 'ask-conversation-response');

    if (updateError) {
      throw new Error(`Erreur lors de la mise à jour: ${updateError.message}`);
    }

    console.log('✅ latest_user_message ajouté avec succès!\n');
    console.log('Available variables mis à jour:', updatedVariables);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

addLatestUserMessageVariable();



