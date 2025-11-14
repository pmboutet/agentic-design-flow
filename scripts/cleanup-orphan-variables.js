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

// Variables pour agents ASK/conversation
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

async function cleanupOrphanVariables(dryRun = true) {
  const mode = dryRun ? '🔍 [DRY RUN]' : '🔧 [CLEANUP]';
  console.log(`${mode} Nettoyage des variables orphelines...\n`);

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

    let totalCleaned = 0;
    const updates = [];

    for (const agent of agents) {
      const activeVariables = agent.available_variables || [];
      const allowedVariables = getVariablesForAgent(agent.slug);
      
      // Filtrer pour garder seulement les variables autorisées ET qui existent dans ALL_VARIABLES
      const cleanedVariables = activeVariables.filter(
        varKey => allowedVariables.includes(varKey) && ALL_VARIABLES.includes(varKey)
      );

      // Si des variables ont été supprimées
      if (cleanedVariables.length !== activeVariables.length) {
        const removed = activeVariables.filter(v => !cleanedVariables.includes(v));
        totalCleaned += removed.length;
        
        updates.push({
          agent: {
            id: agent.id,
            slug: agent.slug,
            name: agent.name,
          },
          before: activeVariables,
          after: cleanedVariables,
          removed,
        });
      }
    }

    // Afficher les résultats
    if (updates.length === 0) {
      console.log('✅ Aucune variable orpheline trouvée. Tous les agents sont cohérents.\n');
    } else {
      console.log(`${mode} ${totalCleaned} variable(s) orpheline(s) à nettoyer dans ${updates.length} agent(s)\n`);
      console.log('═'.repeat(80));
      
      for (const update of updates) {
        console.log(`\n📌 Agent: ${update.agent.name} (${update.agent.slug})`);
        console.log(`   ID: ${update.agent.id}`);
        console.log(`   Variables avant: ${update.before.length} → Variables après: ${update.after.length}`);
        console.log(`   Variables supprimées:`);
        update.removed.forEach(varKey => {
          console.log(`      - ${varKey}`);
        });
        console.log(`   Variables conservées:`);
        update.after.forEach(varKey => {
          console.log(`      ✅ ${varKey}`);
        });
        console.log('\n' + '─'.repeat(80));
      }

      // Appliquer les mises à jour si ce n'est pas un dry run
      if (!dryRun) {
        console.log('\n💾 Application des corrections...\n');
        
        for (const update of updates) {
          const { error } = await supabase
            .from('ai_agents')
            .update({ available_variables: update.after })
            .eq('id', update.agent.id);

          if (error) {
            console.error(`❌ Erreur lors de la mise à jour de l'agent ${update.agent.name}:`, error);
          } else {
            console.log(`✅ Agent "${update.agent.name}" mis à jour (${update.removed.length} variable(s) supprimée(s))`);
          }
        }
        
        console.log('\n✅ Nettoyage terminé !');
      } else {
        console.log('\n💡 Pour appliquer ces corrections, exécutez:');
        console.log('   node scripts/cleanup-orphan-variables.js --apply\n');
      }
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

// Vérifier les arguments de ligne de commande
const args = process.argv.slice(2);
const shouldApply = args.includes('--apply') || args.includes('-a');

// Exécuter le nettoyage
cleanupOrphanVariables(!shouldApply)
  .then(() => {
    console.log('\n✅ Script terminé.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });






