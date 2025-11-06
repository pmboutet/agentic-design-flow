require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Toutes les variables définies dans PROMPT_VARIABLES
const ALL_VARIABLES = [
  "ask_key",
  "ask_question",
  "ask_description",
  "system_prompt_project",
  "system_prompt_challenge",
  "system_prompt_ask",
  "message_history",
  "latest_user_message",
  "latest_ai_response",
  "participant_name",
  "participants",
  "existing_insights_json",
  // Variables pour challenge-builder
  "project_name",
  "project_goal",
  "project_status",
  "challenge_id",
  "challenge_title",
  "challenge_description",
  "challenge_status",
  "challenge_impact",
  "challenge_context_json",
  "insights_json",
  "existing_asks_json",
  "insight_types",
];

// Variables pour agents ASK/conversation (copié de page.tsx)
const askVariables = [
  "ask_key",
  "ask_question",
  "ask_description",
  "message_history",
  "latest_user_message",
  "latest_ai_response",
  "participant_name",
  "participants",
  "existing_insights_json",
  "system_prompt_ask",
  "system_prompt_challenge",
  "system_prompt_project",
];

// Variables pour agents challenge-builder et ask-generator
const challengeVariables = [
  "project_name",
  "project_goal",
  "project_status",
  "challenge_id",
  "challenge_title",
  "challenge_description",
  "challenge_status",
  "challenge_impact",
  "challenge_context_json",
  "insights_json",
  "existing_asks_json",
  "system_prompt_project",
  "system_prompt_challenge",
];

/**
 * Simule la fonction getVariablesForAgent de page.tsx
 */
function getVariablesForAgent(agentSlug) {
  const slug = agentSlug.toLowerCase();
  
  if (slug.includes("conversation") || slug.includes("chat") || slug.includes("ask-conversation")) {
    return askVariables;
  }
  
  if (slug.includes("challenge") || slug.includes("builder")) {
    return challengeVariables;
  }
  
  if (slug.includes("ask-generator") || slug.includes("generator")) {
    return challengeVariables;
  }
  
  if (slug.includes("insight-detection") || slug.includes("insight")) {
    // Variables pour détection d'insights
    return [
      ...askVariables,
      "existing_insights_json",
      "insight_types",
    ];
  }

  // Par défaut, toutes les variables
  return ALL_VARIABLES;
}

async function testOrphanVariables() {
  console.log('🔍 Recherche des variables orphelines...\n');

  try {
    // Récupérer tous les agents
    const { data: agents, error: agentsError } = await supabase
      .from('ai_agents')
      .select('id, slug, name, available_variables')
      .order('slug');

    if (agentsError) {
      console.error('❌ Erreur lors de la récupération des agents:', agentsError);
      return;
    }

    if (!agents || agents.length === 0) {
      console.log('⚠️  Aucun agent trouvé en base de données.');
      return;
    }

    console.log(`📊 ${agents.length} agent(s) trouvé(s)\n`);

    let totalOrphans = 0;
    const results = [];

    for (const agent of agents) {
      const activeVariables = agent.available_variables || [];
      const allowedVariables = getVariablesForAgent(agent.slug);
      
      // Trouver les variables actives qui ne sont PAS dans la liste autorisée
      const orphanVariables = activeVariables.filter(
        varKey => !allowedVariables.includes(varKey)
      );

      // Trouver aussi les variables qui n'existent pas du tout dans ALL_VARIABLES
      const unknownVariables = activeVariables.filter(
        varKey => !ALL_VARIABLES.includes(varKey)
      );

      if (orphanVariables.length > 0 || unknownVariables.length > 0) {
        totalOrphans += orphanVariables.length + unknownVariables.length;
        
        results.push({
          agent: {
            id: agent.id,
            slug: agent.slug,
            name: agent.name,
          },
          activeVariables,
          allowedVariables,
          orphanVariables,
          unknownVariables,
        });
      }
    }

    // Afficher les résultats
    if (results.length === 0) {
      console.log('✅ Aucune variable orpheline trouvée ! Tous les agents sont cohérents.\n');
    } else {
      console.log(`⚠️  ${totalOrphans} variable(s) orpheline(s) trouvée(s) dans ${results.length} agent(s)\n`);
      console.log('═'.repeat(80));
      
      for (const result of results) {
        console.log(`\n📌 Agent: ${result.agent.name} (${result.agent.slug})`);
        console.log(`   ID: ${result.agent.id}`);
        console.log(`   Variables actives en BDD: ${result.activeVariables.length}`);
        console.log(`   Variables autorisées pour cet agent: ${result.allowedVariables.length}`);
        
        if (result.orphanVariables.length > 0) {
          console.log(`\n   ⚠️  Variables orphelines (actives mais non affichées dans l'UI):`);
          result.orphanVariables.forEach(varKey => {
            console.log(`      - ${varKey}`);
          });
        }
        
        if (result.unknownVariables.length > 0) {
          console.log(`\n   ❌ Variables inconnues (n'existent pas dans PROMPT_VARIABLES):`);
          result.unknownVariables.forEach(varKey => {
            console.log(`      - ${varKey}`);
          });
        }
        
        console.log(`\n   Variables actives en BDD:`);
        result.activeVariables.forEach(varKey => {
          const isAllowed = result.allowedVariables.includes(varKey);
          const exists = ALL_VARIABLES.includes(varKey);
          const status = isAllowed ? '✅' : (exists ? '⚠️' : '❌');
          console.log(`      ${status} ${varKey}`);
        });
        
        console.log('\n' + '─'.repeat(80));
      }

      // Suggestions de correction
      console.log('\n💡 Suggestions de correction:\n');
      console.log('Option 1: Désactiver les variables orphelines via SQL');
      console.log('Option 2: Modifier getVariablesForAgent() pour inclure ces variables');
      console.log('Option 3: Créer un script de nettoyage automatique\n');
      
      // Générer le SQL de correction
      console.log('📝 SQL pour désactiver les variables orphelines:\n');
      for (const result of results) {
        const variablesToRemove = [...result.orphanVariables, ...result.unknownVariables];
        if (variablesToRemove.length > 0) {
          const cleanedVariables = result.activeVariables.filter(
            v => !variablesToRemove.includes(v)
          );
          console.log(`-- Agent: ${result.agent.name} (${result.agent.slug})`);
          console.log(`UPDATE ai_agents`);
          console.log(`SET available_variables = ARRAY[${cleanedVariables.map(v => `'${v}'`).join(', ')}]`);
          console.log(`WHERE id = '${result.agent.id}';`);
          console.log('');
        }
      }
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

// Exécuter le test
testOrphanVariables()
  .then(() => {
    console.log('\n✅ Test terminé.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });

