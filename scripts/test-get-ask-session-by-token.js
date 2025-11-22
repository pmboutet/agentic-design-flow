#!/usr/bin/env node

/**
 * Script pour tester directement la fonction get_ask_session_by_token
 * avec un token valide pour voir si l'erreur persiste
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { Client } = require('pg');

function normalizeConnectionString(connectionString) {
  if (!connectionString) return connectionString;
  try {
    const url = new URL(connectionString);
    if (url.searchParams.has('sslmode')) {
      url.searchParams.delete('sslmode');
    }
    return url.toString();
  } catch (e) {
    return connectionString.replace(/[&?]sslmode=[^&]*/g, '');
  }
}

function getSSLConfig() {
  const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
  if (sslMode === 'disable') return false;
  return { rejectUnauthorized: false };
}

async function testFunction() {
  const token = process.argv[2];
  
  if (!token) {
    console.error('❌ Usage: node scripts/test-get-ask-session-by-token.js <token>');
    console.error('   Exemple: node scripts/test-get-ask-session-by-token.js abc123...');
    process.exit(1);
  }

  let connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_MIGRATIONS_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL (ou POSTGRES_URL / SUPABASE_MIGRATIONS_URL) doit être défini');
    process.exit(1);
  }

  connectionString = normalizeConnectionString(connectionString);
  const sslConfig = getSSLConfig();
  const client = new Client({ connectionString, ssl: sslConfig });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');
    console.log(`🧪 Test de get_ask_session_by_token avec le token: ${token.substring(0, 8)}...\n`);

    // Tester la fonction directement
    // Note: Pour les fonctions RETURNS TABLE, on peut les appeler directement
    const { rows, rowCount } = await client.query(
      `SELECT * FROM public.get_ask_session_by_token($1::VARCHAR)`,
      [token]
    );

    if (rowCount === 0) {
      console.log('⚠️  La fonction s\'exécute sans erreur, mais aucun résultat retourné.');
      console.log('   Cela peut signifier que le token est invalide ou expiré.\n');
      
      // Vérifier si le token existe dans ask_participants
      const { rows: tokenRows } = await client.query(
        `SELECT id, ask_session_id, invite_token FROM public.ask_participants WHERE invite_token = $1 LIMIT 1`,
        [token]
      );
      
      if (tokenRows.length === 0) {
        console.log('❌ Le token n\'existe pas dans la table ask_participants');
      } else {
        console.log('✅ Le token existe dans ask_participants:');
        console.log(`   - Participant ID: ${tokenRows[0].id}`);
        console.log(`   - Ask Session ID: ${tokenRows[0].ask_session_id}`);
        console.log(`   - Token: ${tokenRows[0].invite_token}`);
      }
    } else {
      console.log('✅ SUCCÈS! La fonction retourne des données:\n');
      const result = rows[0];
      console.log(`   - ask_session_id: ${result.ask_session_id}`);
      console.log(`   - ask_key: ${result.ask_key}`);
      console.log(`   - question: ${result.question?.substring(0, 50)}...`);
      console.log(`   - status: ${result.status}`);
      console.log(`   - project_id: ${result.project_id || 'null'}`);
      console.log(`   - challenge_id: ${result.challenge_id || 'null'}`);
    }

    console.log('\n✅ Aucune erreur "ambiguous column reference" détectée!\n');

  } catch (error) {
    console.error('❌ ERREUR lors de l\'exécution de la fonction:\n');
    console.error(`   Message: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    
    if (error.message.includes('ambiguous')) {
      console.error('\n⚠️  ERREUR DÉTECTÉE: "ambiguous column reference"');
      console.error('   Le correctif de la migration 034 n\'est peut-être pas appliqué correctement.');
    }
    
    console.error('\nStack trace:');
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

testFunction().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

