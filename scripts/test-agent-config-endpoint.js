#!/usr/bin/env node

/**
 * Test de l'endpoint /api/ask/[key]/agent-config avec un token
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const token = process.argv[2];
const askKey = process.argv[3] || 'segments-marche-prioritaires';

if (!token) {
  console.error('❌ Usage: node scripts/test-agent-config-endpoint.js <token> [askKey]');
  console.error('   Exemple: node scripts/test-agent-config-endpoint.js 1643f806ebf868a0d1a414ceda9b5269');
  process.exit(1);
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const url = `${baseUrl}/api/ask/${askKey}/agent-config?token=${token}`;

console.log(`🧪 Test de l'endpoint agent-config avec token\n`);
console.log(`   URL: ${url}\n`);

async function testEndpoint() {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    console.log(`📊 Réponse HTTP: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      console.error('❌ ERREUR:');
      console.error(`   Status: ${response.status}`);
      console.error(`   Message: ${data.error || 'Unknown error'}`);
      if (data.error && data.error.includes('permission denied')) {
        console.error('\n⚠️  Problème de permissions RLS détecté');
        console.error('   Vérifiez que les fonctions RPC sont utilisées correctement');
      }
      process.exit(1);
    }

    if (data.success) {
      console.log('✅ SUCCÈS!\n');
      console.log('📋 Données retournées:');
      console.log(`   - System Prompt: ${data.data?.systemPrompt ? 'Présent' : 'Absent'}`);
      console.log(`   - User Prompt: ${data.data?.userPrompt ? 'Présent' : 'Absent'}`);
      console.log(`   - Model Config: ${data.data?.modelConfig ? 'Présent' : 'Absent'}`);
      if (data.data?.modelConfig) {
        console.log(`     - Provider: ${data.data.modelConfig.provider}`);
        console.log(`     - Model: ${data.data.modelConfig.model}`);
      }
      console.log(`   - Prompt Variables: ${data.data?.promptVariables ? 'Présent' : 'Absent'}`);
      
      if (data.data?.promptVariables) {
        const vars = data.data.promptVariables;
        console.log(`     - ask_question: ${vars.ask_question ? 'Présent' : 'Absent'}`);
        console.log(`     - participants: ${vars.participants ? 'Présent' : 'Absent'}`);
        console.log(`     - messages_json: ${vars.messages_json ? 'Présent' : 'Absent'}`);
      }
    } else {
      console.error('❌ La réponse indique un échec:');
      console.error(`   Error: ${data.error}`);
      process.exit(1);
    }

    console.log('\n✅ Test réussi!\n');

  } catch (error) {
    console.error('❌ Erreur lors du test:');
    console.error(`   ${error.message}`);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n⚠️  Le serveur local n\'est pas démarré');
      console.error('   Lancez: npm run dev');
    }
    process.exit(1);
  }
}

testEndpoint();

