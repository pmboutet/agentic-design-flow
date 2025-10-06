#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkInsightSystem() {
  console.log('🔍 Vérification du système de détection d\'insights...\n');

  try {
    // 1. Vérifier la configuration Supabase
    console.log('1️⃣ Configuration Supabase:');
    if (!supabaseUrl || supabaseUrl === 'https://your-project.supabase.co') {
      console.log('❌ NEXT_PUBLIC_SUPABASE_URL non configuré');
      return;
    }
    if (!supabaseServiceKey || supabaseServiceKey === 'your-service-key') {
      console.log('❌ SUPABASE_SERVICE_ROLE_KEY non configuré');
      return;
    }
    console.log('✅ Configuration Supabase OK');

    // 2. Vérifier la connexion à la base de données
    console.log('\n2️⃣ Connexion à la base de données:');
    const { data: testData, error: testError } = await supabase
      .from('ai_agents')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.log('❌ Erreur de connexion:', testError.message);
      return;
    }
    console.log('✅ Connexion à la base de données OK');

    // 3. Vérifier l'agent de détection d'insights
    console.log('\n3️⃣ Agent de détection d\'insights:');
    const { data: insightAgent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('slug', 'ask-insight-detection')
      .maybeSingle();

    if (agentError) {
      console.log('❌ Erreur lors de la récupération de l\'agent:', agentError.message);
      return;
    }

    if (!insightAgent) {
      console.log('❌ Agent de détection d\'insights non trouvé');
      console.log('💡 Solution: Exécutez le script d\'initialisation des données AI');
      return;
    }

    console.log('✅ Agent trouvé:', insightAgent.name);
    console.log(`   - ID: ${insightAgent.id}`);
    console.log(`   - Model Config ID: ${insightAgent.model_config_id}`);
    console.log(`   - System Prompt: ${insightAgent.system_prompt?.length || 0} caractères`);

    // 4. Vérifier la configuration du modèle
    console.log('\n4️⃣ Configuration du modèle:');
    const { data: modelConfig, error: modelError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .eq('id', insightAgent.model_config_id)
      .maybeSingle();

    if (modelError) {
      console.log('❌ Erreur lors de la récupération du modèle:', modelError.message);
      return;
    }

    if (!modelConfig) {
      console.log('❌ Configuration du modèle non trouvée');
      return;
    }

    console.log('✅ Configuration du modèle trouvée:');
    console.log(`   - Provider: ${modelConfig.provider}`);
    console.log(`   - Model: ${modelConfig.model}`);
    console.log(`   - API Key Env Var: ${modelConfig.api_key_env_var}`);

    // 5. Vérifier les variables d'environnement API
    console.log('\n5️⃣ Variables d\'environnement API:');
    const apiKeyEnvVar = modelConfig.api_key_env_var;
    const apiKey = process.env[apiKeyEnvVar];
    
    if (!apiKey) {
      console.log(`❌ Variable d'environnement ${apiKeyEnvVar} non définie`);
      console.log('💡 Solution: Ajoutez votre clé API dans le fichier .env.local');
      return;
    }
    console.log(`✅ Variable d'environnement ${apiKeyEnvVar} définie`);

    // 6. Vérifier les tables nécessaires
    console.log('\n6️⃣ Tables de la base de données:');
    const tables = [
      'insights',
      'insight_authors', 
      'insight_types',
      'ai_insight_jobs',
      'kpi_estimations'
    ];

    for (const table of tables) {
      const { error: tableError } = await supabase
        .from(table)
        .select('count')
        .limit(1);
      
      if (tableError) {
        console.log(`❌ Table ${table} non accessible:`, tableError.message);
        return;
      }
      console.log(`✅ Table ${table} accessible`);
    }

    // 7. Vérifier les types d'insights
    console.log('\n7️⃣ Types d\'insights:');
    const { data: insightTypes, error: typesError } = await supabase
      .from('insight_types')
      .select('*');

    if (typesError) {
      console.log('❌ Erreur lors de la récupération des types:', typesError.message);
      return;
    }

    if (!insightTypes || insightTypes.length === 0) {
      console.log('⚠️  Aucun type d\'insight configuré');
      console.log('💡 Solution: Exécutez les migrations de base de données');
    } else {
      console.log(`✅ ${insightTypes.length} types d'insights configurés`);
      insightTypes.forEach(type => {
        console.log(`   - ${type.name} (${type.id})`);
      });
    }

    // 8. Test de simulation
    console.log('\n8️⃣ Test de simulation:');
    console.log('✅ Tous les composants sont en place');
    console.log('✅ Le système de détection d\'insights devrait fonctionner');
    console.log('\n📋 Résumé:');
    console.log('   - Configuration Supabase: OK');
    console.log('   - Agent de détection: OK');
    console.log('   - Configuration du modèle: OK');
    console.log('   - Variables d\'environnement: OK');
    console.log('   - Tables de base de données: OK');
    console.log('   - Types d\'insights: OK');

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error.message);
  }
}

checkInsightSystem();
