#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables:');
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

async function runMigration() {
  console.log('🚀 Running migration 008: Create challenge_foundation_insights table...\n');

  const migrationPath = path.join(__dirname, '..', 'migrations', '008_create_challenge_foundation_insights.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Migration file not found:', migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('📝 Executing SQL...\n');
  
  // Note: Supabase client doesn't support raw SQL execution for security reasons
  // We need to execute this via the Supabase SQL editor or use pg client
  console.log('⚠️  This migration needs to be run manually in Supabase SQL Editor or via psql.\n');
  console.log('Copy and paste the following SQL into your Supabase SQL Editor:\n');
  console.log('─'.repeat(80));
  console.log(sql);
  console.log('─'.repeat(80));
  console.log('\n📍 Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new');
  console.log('   Then paste the SQL above and click "Run".\n');
  
  // Alternative: try using rpc if available
  try {
    console.log('🔄 Attempting to create table via direct query...\n');
    
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log('   Executing:', statement.substring(0, 50) + '...');
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        console.error('   ❌ Error:', error.message);
        throw error;
      }
      console.log('   ✅ Success');
    }
    
    console.log('\n✅ Migration 008 completed successfully!');
  } catch (error) {
    console.error('\n❌ Automatic execution failed:', error.message);
    console.log('\n⚠️  Please run the SQL manually in Supabase SQL Editor (shown above).');
  }
}

runMigration().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

