#!/usr/bin/env node

/**
 * Script pour vérifier la définition actuelle de get_ask_session_by_token
 * dans la base de données
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { Client } = require('pg');
const path = require('path');

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

async function checkFunctionDefinition() {
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

    // Récupérer la définition de la fonction
    const { rows } = await client.query(`
      SELECT pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname = 'get_ask_session_by_token'
        AND pronamespace = 'public'::regnamespace
      LIMIT 1;
    `);

    if (rows.length === 0) {
      console.log('❌ La fonction get_ask_session_by_token n\'existe pas dans la base de données');
      return;
    }

    const definition = rows[0].definition;
    
    // Vérifier si le correctif est présent
    const hasFix = definition.includes('a.id AS ask_session_id');
    const hasOldVersion = definition.includes('a.id,') && !definition.includes('a.id AS ask_session_id');

    console.log('📋 Définition de la fonction get_ask_session_by_token:\n');
    console.log('─'.repeat(80));
    
    if (hasFix) {
      console.log('✅ CORRECTIF PRÉSENT: La fonction utilise "a.id AS ask_session_id"');
    } else if (hasOldVersion) {
      console.log('⚠️  PROBLÈME DÉTECTÉ: La fonction utilise "a.id" sans alias explicite');
      console.log('   Cela peut causer l\'erreur "column reference is ambiguous"');
    } else {
      console.log('⚠️  Impossible de déterminer si le correctif est présent');
    }
    
    console.log('─'.repeat(80));
    console.log('\nExtrait de la définition (lignes autour du SELECT):\n');
    
    // Extraire la partie SELECT pour affichage
    const selectMatch = definition.match(/RETURN QUERY\s+SELECT[\s\S]{0,500}/i);
    if (selectMatch) {
      const selectPart = selectMatch[0];
      const lines = selectPart.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('ask_session_id') || line.includes('a.id')) {
          console.log(`   ${line.trim()}`);
        }
      });
    } else {
      // Afficher un extrait général
      const lines = definition.split('\n');
      let inSelect = false;
      for (const line of lines) {
        if (line.includes('RETURN QUERY') || line.includes('SELECT')) {
          inSelect = true;
        }
        if (inSelect && (line.includes('ask_session_id') || line.includes('a.id'))) {
          console.log(`   ${line.trim()}`);
          if (line.includes('FROM')) break;
        }
      }
    }

    console.log('\n─'.repeat(80));
    
    // Vérifier aussi dans la table schema_migrations
    const { rows: migrationRows } = await client.query(`
      SELECT version, name, executed_at
      FROM public.schema_migrations
      WHERE version = '034'
      ORDER BY executed_at DESC
      LIMIT 1;
    `);

    if (migrationRows.length > 0) {
      console.log(`\n✅ Migration 034 enregistrée dans schema_migrations:`);
      console.log(`   - Version: ${migrationRows[0].version}`);
      console.log(`   - Nom: ${migrationRows[0].name}`);
      console.log(`   - Exécutée le: ${migrationRows[0].executed_at}`);
    } else {
      console.log(`\n⚠️  Migration 034 non trouvée dans schema_migrations`);
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

checkFunctionDefinition().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

