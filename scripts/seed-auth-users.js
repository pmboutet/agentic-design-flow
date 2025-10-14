#!/usr/bin/env node

/**
 * Seed script to create test users with Supabase Auth
 * 
 * This script creates users in auth.users and their profiles are automatically
 * created via the handle_new_user() trigger.
 * 
 * Usage:
 *   node scripts/seed-auth-users.js
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test users matching the ones from DATABASE_SETUP.md
const testUsers = [
  {
    id: '550e8400-e29b-41d4-a716-446655440011',
    email: 'pierre.marie@techcorp.com',
    password: 'Password123!',
    user_metadata: {
      full_name: 'Pierre-Marie Boutet',
      fullName: 'Pierre-Marie Boutet',
      first_name: 'Pierre-Marie',
      firstName: 'Pierre-Marie',
      last_name: 'Boutet',
      lastName: 'Boutet',
      role: 'facilitator'
    }
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440012',
    email: 'sarah.manager@techcorp.com',
    password: 'Password123!',
    user_metadata: {
      full_name: 'Sarah Martin',
      fullName: 'Sarah Martin',
      first_name: 'Sarah',
      firstName: 'Sarah',
      last_name: 'Martin',
      lastName: 'Martin',
      role: 'manager'
    }
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440013',
    email: 'dev.team@techcorp.com',
    password: 'Password123!',
    user_metadata: {
      full_name: 'Alex Developer',
      fullName: 'Alex Developer',
      first_name: 'Alex',
      firstName: 'Alex',
      last_name: 'Developer',
      lastName: 'Developer',
      role: 'participant'
    }
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440014',
    email: 'admin@techcorp.com',
    password: 'Admin123!',
    user_metadata: {
      full_name: 'Admin User',
      fullName: 'Admin User',
      first_name: 'Admin',
      firstName: 'Admin',
      last_name: 'User',
      lastName: 'User',
      role: 'full_admin'
    }
  }
];

async function seedUsers() {
  console.log('🌱 Seeding test users with Supabase Auth...\n');

  const clientId = '550e8400-e29b-41d4-a716-446655440001'; // TechCorp client ID

  for (const userData of testUsers) {
    try {
      console.log(`Creating user: ${userData.email}`);

      // Create user in auth.users
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        id: userData.id,
        email: userData.email,
        password: userData.password,
        email_confirm: true,
        user_metadata: userData.user_metadata
      });

      if (authError) {
        if (authError.message.includes('already exists') || authError.message.includes('duplicate')) {
          console.log(`  ⚠️  User already exists, skipping`);
          continue;
        }
        throw authError;
      }

      console.log(`  ✓ Auth user created: ${authData.user.id}`);

      // Wait a bit for the trigger to execute
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update profile with client_id (trigger doesn't set this)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ client_id: clientId })
        .eq('auth_id', authData.user.id);

      if (profileError) {
        console.log(`  ⚠️  Warning: Could not update profile client_id: ${profileError.message}`);
      } else {
        console.log(`  ✓ Profile updated with client_id`);
      }

      console.log(`  ✅ User ${userData.email} created successfully\n`);
    } catch (error) {
      console.error(`  ❌ Error creating user ${userData.email}:`, error.message);
      console.error('');
    }
  }

  console.log('\n✅ Seeding complete!');
  console.log('\nTest credentials:');
  testUsers.forEach(user => {
    console.log(`  ${user.email} / ${user.password}`);
  });
}

// Run the seed
seedUsers().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

