#!/usr/bin/env node

/**
 * Test de la fonction via Supabase client (comme dans le code réel)
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Variables d\'environnement manquantes');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function testFunction() {
  const token = process.argv[2];
  
  if (!token) {
    console.error('❌ Usage: node scripts/test-function-supabase.js <token>');
    process.exit(1);
  }

  console.log(`🧪 Test de get_ask_session_by_token via Supabase client avec le token: ${token.substring(0, 8)}...\n`);

  try {
    const { data, error } = await supabase
      .rpc('get_ask_session_by_token', { p_token: token })
      .maybeSingle();

    if (error) {
      console.error('❌ ERREUR:');
      console.error(`   Message: ${error.message}`);
      console.error(`   Code: ${error.code}`);
      console.error(`   Details: ${error.details || 'N/A'}`);
      console.error(`   Hint: ${error.hint || 'N/A'}`);
      return;
    }

    if (!data) {
      console.log('⚠️  La fonction s\'exécute sans erreur, mais aucun résultat retourné.');
      console.log('   Cela peut signifier que le token est invalide ou expiré.\n');
    } else {
      console.log('✅ SUCCÈS! La fonction retourne des données:\n');
      console.log(`   - ask_session_id: ${data.ask_session_id}`);
      console.log(`   - ask_key: ${data.ask_key}`);
      console.log(`   - question: ${data.question?.substring(0, 50)}...`);
      console.log(`   - status: ${data.status}`);
      console.log(`   - project_id: ${data.project_id || 'null'}`);
      console.log(`   - challenge_id: ${data.challenge_id || 'null'}`);
    }

    console.log('\n✅ Aucune erreur détectée!\n');

  } catch (error) {
    console.error('❌ Erreur fatale:', error.message);
    console.error(error.stack);
  }
}

testFunction().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

