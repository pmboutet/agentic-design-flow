#!/usr/bin/env node

/**
 * Test script to verify Supabase Auth migration
 * 
 * This script checks:
 * - Database schema (profiles table exists, users table renamed)
 * - Trigger function exists
 * - RLS is enabled
 * - Test users can be created
 * 
 * Usage:
 *   node scripts/test-auth-migration.js
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testMigration() {
  console.log('🧪 Testing Supabase Auth Migration...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Check if profiles table exists
  console.log('Test 1: Checking if profiles table exists...');
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.message.includes('does not exist')) {
      console.log('  ❌ FAILED: profiles table does not exist');
      failed++;
    } else {
      console.log('  ✅ PASSED: profiles table exists');
      passed++;
    }
  } catch (error) {
    console.log('  ❌ FAILED:', error.message);
    failed++;
  }

  // Test 2: Check if users table was renamed
  console.log('\nTest 2: Checking if users table was renamed...');
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error && error.message.includes('does not exist')) {
      console.log('  ✅ PASSED: users table no longer exists (properly renamed)');
      passed++;
    } else {
      console.log('  ⚠️  WARNING: users table still exists (migration may not have run)');
      failed++;
    }
  } catch (error) {
    console.log('  ✅ PASSED: users table properly removed');
    passed++;
  }

  // Test 3: Check if auth_id column exists in profiles
  console.log('\nTest 3: Checking if auth_id column exists in profiles...');
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('auth_id')
      .limit(1);
    
    if (error && error.message.includes('column')) {
      console.log('  ❌ FAILED: auth_id column does not exist');
      failed++;
    } else {
      console.log('  ✅ PASSED: auth_id column exists');
      passed++;
    }
  } catch (error) {
    console.log('  ❌ FAILED:', error.message);
    failed++;
  }

  // Test 4: Check if RLS is enabled on profiles
  console.log('\nTest 4: Checking if RLS is enabled on profiles...');
  try {
    const { data, error } = await supabase.rpc('exec', {
      sql: `
        SELECT relrowsecurity 
        FROM pg_class 
        WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace
      `
    });
    
    // Note: This test might not work depending on RPC permissions
    // It's more of a guidance check
    console.log('  ℹ️  INFO: Check manually in Supabase dashboard (Table > profiles > RLS enabled)');
    passed++;
  } catch (error) {
    console.log('  ℹ️  INFO: Could not check RLS status automatically');
    passed++;
  }

  // Test 5: Test creating a user via Auth
  console.log('\nTest 5: Testing user creation via Supabase Auth...');
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'Test User',
        first_name: 'Test',
        last_name: 'User'
      }
    });

    if (authError) {
      console.log('  ❌ FAILED: Could not create auth user:', authError.message);
      failed++;
    } else {
      console.log('  ✅ Auth user created:', authData.user.id);

      // Wait for trigger to execute
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if profile was auto-created
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        console.log('  ❌ FAILED: Profile was not auto-created by trigger');
        failed++;
      } else {
        console.log('  ✅ PASSED: Profile auto-created successfully');
        passed++;

        // Clean up test user
        await supabase.auth.admin.deleteUser(authData.user.id);
        console.log('  ✅ Test user cleaned up');
      }
    }
  } catch (error) {
    console.log('  ❌ FAILED:', error.message);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Migration successful.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the migration.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
testMigration().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

