#!/usr/bin/env node

/**
 * Apply migration 015: Fix table GRANTS
 * Usage: node scripts/apply-migration-015.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function applyMigration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Variables d\'environnement manquantes!');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });

  console.log('📦 Application de la migration 015: Fix table GRANTS...\n');

  // Lire le fichier de migration
  const migrationPath = path.join(__dirname, '..', 'migrations', '015_fix_table_grants.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  try {
    // Exécuter la migration
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL }).single();

    if (error) {
      // Si la fonction exec_sql n'existe pas, essayer directement
      console.log('⚠️  La fonction exec_sql n\'existe pas, exécution directe...');
      
      // Diviser en commandes individuelles
      const commands = migrationSQL
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd && !cmd.startsWith('--'));

      for (const command of commands) {
        if (command) {
          const { error: cmdError } = await supabase.rpc('exec', { query: command });
          if (cmdError) {
            console.error(`❌ Erreur sur commande: ${command.substring(0, 100)}...`);
            console.error(`   ${cmdError.message}`);
          }
        }
      }
      
      console.log('\n⚠️  Note: Certaines commandes peuvent avoir échoué.');
      console.log('   Copiez le contenu de migrations/015_fix_table_grants.sql');
      console.log('   et exécutez-le directement dans Supabase SQL Editor.\n');
    } else {
      console.log('✅ Migration 015 appliquée avec succès!');
    }

    // Vérifier les grants
    console.log('\n🔍 Vérification des grants sur la table profiles...');
    const { data: grants, error: grantError } = await supabase
      .from('information_schema.role_table_grants')
      .select('grantee, privilege_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'profiles');

    if (!grantError && grants) {
      console.log('   Grants trouvés:');
      grants.forEach(g => {
        console.log(`   - ${g.grantee}: ${g.privilege_type}`);
      });
    }

  } catch (err) {
    console.error('\n❌ Erreur lors de l\'application:', err.message);
    console.log('\n📝 Solution manuelle:');
    console.log('   1. Allez dans Supabase Dashboard > SQL Editor');
    console.log('   2. Ouvrez migrations/015_fix_table_grants.sql');
    console.log('   3. Copiez et exécutez le SQL\n');
    process.exit(1);
  }

  console.log('\n✅ Terminé!');
}

applyMigration().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});

