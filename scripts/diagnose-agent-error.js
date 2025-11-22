#!/usr/bin/env node
/**
 * Script to diagnose agent configuration issues
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function diagnose() {
  console.log('🔍 Diagnostic des agents AI...\n');

  // Check chat agent
  console.log('1️⃣ Vérification de l\'agent "ask-conversation-response"...');
  const { data: agent, error: agentError } = await supabase
    .from('ai_agents')
    .select(`
      *,
      model_config:ai_model_configs!model_config_id(*),
      fallback_model_config:ai_model_configs!fallback_model_config_id(*)
    `)
    .eq('slug', 'ask-conversation-response')
    .maybeSingle();

  if (agentError) {
    console.error('❌ Erreur lors de la récupération de l\'agent:', agentError);
    return;
  }

  if (!agent) {
    console.error('❌ Agent "ask-conversation-response" introuvable!');
    console.log('\n💡 Solution: Exécutez le script de restauration:');
    console.log('   node scripts/restore-all-agents.js');
    return;
  }

  console.log('✅ Agent trouvé:', agent.name);
  console.log('   - ID:', agent.id);
  console.log('   - Slug:', agent.slug);
  console.log('   - System prompt length:', agent.system_prompt?.length || 0);
  console.log('   - User prompt length:', agent.user_prompt?.length || 0);
  console.log('   - Available variables:', agent.available_variables || []);

  // Check system prompt
  if (!agent.system_prompt || agent.system_prompt.trim().length === 0) {
    console.error('\n❌ PROBLÈME: System prompt vide!');
  } else {
    console.log('\n✅ System prompt présent');
    // Check for Handlebars syntax
    const hasHandlebars = agent.system_prompt.includes('{{') && agent.system_prompt.includes('}}');
    if (hasHandlebars) {
      console.log('   ✅ Contient des variables Handlebars');
    } else {
      console.log('   ⚠️  Aucune variable Handlebars détectée');
    }
  }

  // Check user prompt
  if (!agent.user_prompt || agent.user_prompt.trim().length === 0) {
    console.error('\n❌ PROBLÈME: User prompt vide!');
  } else {
    console.log('\n✅ User prompt présent');
    const hasHandlebars = agent.user_prompt.includes('{{') && agent.user_prompt.includes('}}');
    if (hasHandlebars) {
      console.log('   ✅ Contient des variables Handlebars');
    } else {
      console.log('   ⚠️  Aucune variable Handlebars détectée');
    }
  }

  // Check model config
  if (!agent.model_config) {
    console.error('\n❌ PROBLÈME: Aucune configuration de modèle!');
  } else {
    console.log('\n✅ Configuration de modèle présente');
    console.log('   - Provider:', agent.model_config.provider);
    console.log('   - Model:', agent.model_config.model);
    console.log('   - API Key env var:', agent.model_config.api_key_env_var);
    
    // Check if API key is set
    const apiKeyEnvVar = agent.model_config.api_key_env_var;
    if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
      console.log('   ✅ Clé API configurée');
    } else {
      console.error(`   ❌ PROBLÈME: Clé API "${apiKeyEnvVar}" non définie dans .env.local`);
    }
  }

  // Check available_variables
  console.log('\n2️⃣ Vérification des variables disponibles...');
  const availableVars = agent.available_variables || [];
  console.log('   Variables déclarées:', availableVars);
  
  const requiredVars = [
    'ask_key',
    'ask_question',
    'ask_description',
    'participants',
    'participants_list',
    'messages_json',
    'latest_user_message',
    'system_prompt_ask',
    'system_prompt_project',
    'system_prompt_challenge'
  ];
  
  const missingVars = requiredVars.filter(v => !availableVars.includes(v));
  if (missingVars.length > 0) {
    console.warn('\n⚠️  Variables manquantes dans available_variables:');
    missingVars.forEach(v => console.log(`   - ${v}`));
    console.log('\n💡 Ces variables devraient être ajoutées à available_variables');
  } else {
    console.log('   ✅ Toutes les variables requises sont présentes');
  }

  // Test Handlebars compilation
  console.log('\n3️⃣ Test de compilation Handlebars...');
  try {
    const Handlebars = require('handlebars');
    const testVars = {
      ask_key: 'test-key',
      ask_question: 'Question test',
      ask_description: 'Description test',
      participants: 'Participant 1, Participant 2',
      participants_list: [{ name: 'Participant 1', role: 'user' }],
      messages_json: JSON.stringify([{ id: '1', content: 'Test message', senderType: 'user' }]),
      latest_user_message: 'Latest test message',
      system_prompt_ask: 'System prompt ask',
      system_prompt_project: 'System prompt project',
      system_prompt_challenge: 'System prompt challenge'
    };

    // Test system prompt
    try {
      const systemTemplate = Handlebars.compile(agent.system_prompt, { noEscape: true, strict: false });
      const systemResult = systemTemplate(testVars);
      console.log('   ✅ System prompt compile sans erreur');
      console.log('   Longueur du résultat:', systemResult.length);
    } catch (err) {
      console.error('   ❌ Erreur de compilation du system prompt:', err.message);
    }

    // Test user prompt
    try {
      const userTemplate = Handlebars.compile(agent.user_prompt, { noEscape: true, strict: false });
      const userResult = userTemplate(testVars);
      console.log('   ✅ User prompt compile sans erreur');
      console.log('   Longueur du résultat:', userResult.length);
    } catch (err) {
      console.error('   ❌ Erreur de compilation du user prompt:', err.message);
    }
  } catch (err) {
    console.error('   ❌ Erreur lors du test Handlebars:', err.message);
  }

  console.log('\n✅ Diagnostic terminé');
}

diagnose().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});



