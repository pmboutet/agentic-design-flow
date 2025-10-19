#!/usr/bin/env node

/**
 * Script de diagnostic pour vérifier la correspondance entre auth.users et profiles
 * Usage: node scripts/diagnose-auth.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function diagnose() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Variables d\'environnement manquantes!');
    console.error('Assurez-vous que .env.local contient:');
    console.error('  - NEXT_PUBLIC_SUPABASE_URL');
    console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });

  console.log('🔍 Diagnostic de l\'authentification...\n');

  // 1. Lister tous les auth users
  console.log('📋 Auth Users:');
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error('❌ Erreur lors de la récupération des auth users:', authError.message);
    process.exit(1);
  }

  console.log(`   Trouvé ${authUsers.users.length} utilisateur(s) dans auth.users\n`);

  // 2. Lister tous les profiles
  console.log('📋 Profiles:');
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, auth_id, role, is_active');

  if (profileError) {
    console.error('❌ Erreur lors de la récupération des profiles:', profileError.message);
    process.exit(1);
  }

  console.log(`   Trouvé ${profiles.length} profil(s) dans public.profiles\n`);

  // 3. Vérifier la correspondance
  console.log('🔗 Vérification de la correspondance auth_id <-> user.id:\n');

  for (const authUser of authUsers.users) {
    const matchingProfile = profiles.find(p => p.auth_id === authUser.id);
    
    if (matchingProfile) {
      console.log(`✅ ${authUser.email}`);
      console.log(`   Auth ID:  ${authUser.id}`);
      console.log(`   Profile:  ${matchingProfile.id}`);
      console.log(`   Role:     ${matchingProfile.role}`);
      console.log(`   Active:   ${matchingProfile.is_active}`);
      
      // Vérifier si c'est un admin
      if (['admin', 'full_admin'].includes(matchingProfile.role) && matchingProfile.is_active) {
        console.log(`   🎯 Admin actif - devrait fonctionner!`);
      } else if (['admin', 'full_admin'].includes(matchingProfile.role) && !matchingProfile.is_active) {
        console.log(`   ⚠️  Admin mais inactif!`);
      }
    } else {
      console.log(`❌ ${authUser.email}`);
      console.log(`   Auth ID:  ${authUser.id}`);
      console.log(`   ⚠️  PAS DE PROFIL CORRESPONDANT!`);
      console.log(`   👉 Solution: Créer un profil avec auth_id = '${authUser.id}'`);
    }
    console.log('');
  }

  // 4. Profils orphelins (profils sans auth user)
  const orphanProfiles = profiles.filter(p => {
    return p.auth_id && !authUsers.users.find(u => u.id === p.auth_id);
  });

  if (orphanProfiles.length > 0) {
    console.log('⚠️  Profils orphelins (auth_id n\'existe pas dans auth.users):');
    orphanProfiles.forEach(p => {
      console.log(`   - ${p.email} (auth_id: ${p.auth_id})`);
    });
    console.log('');
  }

  // 5. Profils sans auth_id
  const noAuthProfiles = profiles.filter(p => !p.auth_id);
  if (noAuthProfiles.length > 0) {
    console.log('⚠️  Profils sans auth_id:');
    noAuthProfiles.forEach(p => {
      console.log(`   - ${p.email} (id: ${p.id})`);
    });
    console.log('');
  }

  console.log('✅ Diagnostic terminé!');
}

diagnose().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});

