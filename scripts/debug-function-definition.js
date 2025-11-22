#!/usr/bin/env node

/**
 * Script pour afficher la définition complète de la fonction
 * et identifier où se trouve le problème
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

async function debugFunction() {
  let connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_MIGRATIONS_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL doit être défini');
    process.exit(1);
  }

  connectionString = normalizeConnectionString(connectionString);
  const sslConfig = getSSLConfig();
  const client = new Client({ connectionString, ssl: sslConfig });

  try {
    await client.connect();
    console.log('✅ Connecté à la base de données\n');

    // Récupérer la définition complète de la fonction
    const { rows } = await client.query(`
      SELECT pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname = 'get_ask_session_by_token'
        AND pronamespace = 'public'::regnamespace
      LIMIT 1;
    `);

    if (rows.length === 0) {
      console.log('❌ Fonction non trouvée');
      return;
    }

    const definition = rows[0].definition;
    
    console.log('📋 DÉFINITION COMPLÈTE DE LA FONCTION:\n');
    console.log('='.repeat(80));
    console.log(definition);
    console.log('='.repeat(80));
    console.log('\n');

    // Analyser le problème
    console.log('🔍 ANALYSE:\n');
    
    // Chercher toutes les occurrences de ask_session_id
    const matches = definition.match(/ask_session_id/gi);
    console.log(`   - Nombre d'occurrences de "ask_session_id": ${matches ? matches.length : 0}`);
    
    // Vérifier la ligne problématique
    const lines = definition.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('ask_session_id') && !line.includes('AS ask_session_id')) {
        console.log(`   - Ligne ${idx + 1} (sans alias): ${line.trim()}`);
      }
    });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
  }
}

debugFunction().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

