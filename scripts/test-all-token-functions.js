#!/usr/bin/env node

/**
 * Test toutes les fonctions RPC utilisées par /api/ask/token/[token]
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

async function testAllFunctions() {
  const token = process.argv[2];
  
  if (!token) {
    console.error('❌ Usage: node scripts/test-all-token-functions.js <token>');
    process.exit(1);
  }

  console.log(`🧪 Test de toutes les fonctions RPC avec le token: ${token.substring(0, 8)}...\n`);

  const functions = [
    { name: 'get_ask_session_by_token', critical: true },
    { name: 'get_participant_by_token', critical: false },
    { name: 'get_ask_participants_by_token', critical: true },
    { name: 'get_ask_context_by_token', critical: false },
    { name: 'get_ask_messages_by_token', critical: false },
    { name: 'get_ask_insights_by_token', critical: false },
  ];

  let hasErrors = false;

  for (const func of functions) {
    try {
      // get_ask_participants_by_token returns multiple rows, others return single or multiple
      const query = func.name === 'get_ask_participants_by_token' || 
                    func.name === 'get_ask_messages_by_token' ||
                    func.name === 'get_ask_insights_by_token'
        ? supabase.rpc(func.name, { p_token: token })
        : supabase.rpc(func.name, { p_token: token }).maybeSingle();
      
      const { data, error } = await query;

      if (error) {
        console.error(`❌ ${func.name}:`);
        console.error(`   Message: ${error.message}`);
        console.error(`   Code: ${error.code}`);
        console.error(`   Details: ${error.details || 'N/A'}`);
        if (func.critical) {
          hasErrors = true;
        }
      } else {
        const resultCount = Array.isArray(data) ? data.length : (data ? 1 : 0);
        console.log(`✅ ${func.name}: ${resultCount} résultat(s)`);
      }
    } catch (error) {
      console.error(`❌ ${func.name}: Erreur fatale`);
      console.error(`   ${error.message}`);
      if (func.critical) {
        hasErrors = true;
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  if (hasErrors) {
    console.log('❌ Des erreurs critiques ont été détectées');
    process.exit(1);
  } else {
    console.log('✅ Toutes les fonctions critiques fonctionnent correctement');
  }
}

testAllFunctions().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

