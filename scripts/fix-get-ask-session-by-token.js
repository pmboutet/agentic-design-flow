#!/usr/bin/env node

/**
 * Script pour vérifier et corriger la fonction get_ask_session_by_token
 * 
 * Ce script applique le correctif de la migration 034 qui résout l'erreur
 * "column reference 'ask_session_id' is ambiguous" en utilisant un alias explicite.
 * 
 * Usage:
 *   node scripts/fix-get-ask-session-by-token.js
 * 
 * Ou avec un token de test:
 *   node scripts/fix-get-ask-session-by-token.js --test-token YOUR_TOKEN
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Variables d\'environnement manquantes:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', !!SUPABASE_URL);
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_ROLE_KEY);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Récupérer le token de test depuis les arguments
const testToken = process.argv.includes('--test-token') 
  ? process.argv[process.argv.indexOf('--test-token') + 1]
  : null;

async function checkFunctionDefinition() {
  console.log('🔍 Vérification de la définition actuelle de la fonction...\n');
  
  // Utiliser une requête SQL directe pour obtenir la définition
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname = 'get_ask_session_by_token'
        AND pronamespace = 'public'::regnamespace
      LIMIT 1;
    `
  });

  if (error) {
    // Si exec_sql n'existe pas, on ne peut pas vérifier automatiquement
    console.log('⚠️  Impossible de vérifier automatiquement la définition.');
    console.log('   La fonction exec_sql n\'existe peut-être pas.\n');
    return null;
  }

  if (data && data.length > 0) {
    const definition = data[0].definition;
    const hasFix = definition.includes('a.id AS ask_session_id');
    
    if (hasFix) {
      console.log('✅ La fonction a déjà le correctif (migration 034 appliquée)\n');
      return true;
    } else {
      console.log('⚠️  La fonction n\'a pas le correctif\n');
      return false;
    }
  }

  return null;
}

async function applyFix() {
  console.log('📝 Application du correctif de la migration 034...\n');
  
  const sqlPath = path.join(__dirname, 'fix-get-ask-session-by-token.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  // Extraire seulement la partie CREATE OR REPLACE FUNCTION
  const functionMatch = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$ LANGUAGE plpgsql SECURITY DEFINER;/);
  
  if (!functionMatch) {
    console.error('❌ Impossible d\'extraire la définition de la fonction du fichier SQL');
    return false;
  }

  const functionSQL = functionMatch[0];
  
  // Essayer d'exécuter via exec_sql si disponible
  const { error: execError } = await supabase.rpc('exec_sql', { sql: functionSQL });
  
  if (execError) {
    console.log('⚠️  Impossible d\'exécuter automatiquement via exec_sql.');
    console.log('   Cette fonction n\'existe peut-être pas dans votre instance Supabase.\n');
    console.log('📋 Veuillez exécuter manuellement le script SQL suivant dans Supabase SQL Editor:\n');
    console.log('─'.repeat(80));
    console.log(functionSQL);
    console.log('─'.repeat(80));
    console.log('\n   Ou exécutez le fichier complet: scripts/fix-get-ask-session-by-token.sql\n');
    return false;
  }

  console.log('✅ Correctif appliqué avec succès!\n');
  return true;
}

async function testFunction(token) {
  if (!token) {
    console.log('ℹ️  Pas de token de test fourni, test ignoré.');
    console.log('   Utilisez --test-token YOUR_TOKEN pour tester la fonction.\n');
    return;
  }

  console.log('🧪 Test de la fonction avec le token fourni...\n');
  
  const { data, error } = await supabase
    .rpc('get_ask_session_by_token', { p_token: token })
    .maybeSingle();

  if (error) {
    console.error('❌ Erreur lors du test:');
    console.error(`   ${error.message}\n`);
    
    if (error.message.includes('ambiguous')) {
      console.error('⚠️  L\'erreur "ambiguous" persiste. Le correctif n\'a peut-être pas été appliqué.\n');
    }
    return false;
  }

  if (data) {
    console.log('✅ Test réussi! La fonction retourne des données:');
    console.log(`   - ask_session_id: ${data.ask_session_id}`);
    console.log(`   - ask_key: ${data.ask_key}`);
    console.log(`   - question: ${data.question?.substring(0, 50)}...\n`);
    return true;
  } else {
    console.log('⚠️  La fonction s\'exécute sans erreur, mais aucun résultat retourné.');
    console.log('   Cela peut signifier que le token est invalide ou expiré.\n');
    return true; // Pas d'erreur SQL, donc le correctif fonctionne
  }
}

async function main() {
  console.log('🔧 Script de correction de get_ask_session_by_token\n');
  console.log('='.repeat(80));
  console.log('');

  // 1. Vérifier la définition actuelle
  const hasFix = await checkFunctionDefinition();

  // 2. Appliquer le correctif si nécessaire
  if (hasFix === false) {
    const applied = await applyFix();
    if (!applied) {
      console.log('⚠️  Le correctif doit être appliqué manuellement.');
      console.log('   Consultez scripts/fix-get-ask-session-by-token.sql\n');
      process.exit(1);
    }
  } else if (hasFix === null) {
    // On ne peut pas vérifier, mais on peut quand même essayer d'appliquer
    console.log('⚠️  Application du correctif par précaution...\n');
    await applyFix();
  }

  // 3. Tester la fonction si un token est fourni
  if (testToken) {
    await testFunction(testToken);
  } else {
    console.log('💡 Pour tester la fonction, exécutez:');
    console.log('   node scripts/fix-get-ask-session-by-token.js --test-token YOUR_TOKEN\n');
  }

  console.log('✅ Script terminé!\n');
}

main().catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});

