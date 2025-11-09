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

async function verifyAgentVariables() {
  console.log('🔍 Vérification de l\'état des variables des agents...\n');

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
    console.log('═'.repeat(80));

    for (const agent of agents) {
      const activeVariables = agent.available_variables || [];
      
      console.log(`\n📌 ${agent.name}`);
      console.log(`   Slug: ${agent.slug}`);
      console.log(`   ID: ${agent.id}`);
      console.log(`   Variables actives: ${activeVariables.length}`);
      
      if (activeVariables.length > 0) {
        console.log(`   Liste des variables:`);
        activeVariables.forEach(varKey => {
          console.log(`      ✅ ${varKey}`);
        });
      } else {
        console.log(`   ⚠️  Aucune variable active`);
      }
      
      console.log('\n' + '─'.repeat(80));
    }

    const totalVariables = agents.reduce((sum, agent) => sum + (agent.available_variables?.length || 0), 0);
    console.log(`\n📈 Résumé:`);
    console.log(`   - Total agents: ${agents.length}`);
    console.log(`   - Total variables actives: ${totalVariables}`);
    console.log(`   - Moyenne par agent: ${(totalVariables / agents.length).toFixed(1)}`);

  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

// Exécuter la vérification
verifyAgentVariables()
  .then(() => {
    console.log('\n✅ Vérification terminée.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });


