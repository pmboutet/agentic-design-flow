#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

console.log('🔍 Testing database connection...\n');

// Parse the connection string to check for issues
try {
  const url = new URL(connectionString);
  console.log('📋 Connection details:');
  console.log('  Protocol:', url.protocol);
  console.log('  Host:', url.hostname);
  console.log('  Port:', url.port);
  console.log('  Database:', url.pathname);
  console.log('  Username:', url.username);
  console.log('  Password length:', url.password ? url.password.length : 0);
  console.log('  Password has special chars:', /[^a-zA-Z0-9]/.test(url.password || '') ? 'Yes' : 'No');
  console.log('  Search params:', url.search || '(none)');
  console.log('');
} catch (err) {
  console.error('❌ Error parsing connection string:', err.message);
  process.exit(1);
}

// Test 1: Connection with SSL (default)
console.log('Test 1: Connecting with SSL...');
const client1 = new Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

client1.connect()
  .then(() => {
    console.log('✅ Connected successfully with SSL!');
    return client1.query('SELECT NOW() as now, current_database() as db, current_user as user');
  })
  .then(result => {
    console.log('  Database:', result.rows[0].db);
    console.log('  User:', result.rows[0].user);
    console.log('  Time:', result.rows[0].now);
    return client1.end();
  })
  .then(() => {
    console.log('✅ All tests passed!\n');
    console.log('💡 Your database connection is working correctly.');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection failed:', err.message);
    console.error('\n💡 Troubleshooting:');
    
    if (err.message.includes('SCRAM') || err.message.includes('authentication')) {
      console.error('  • Check if your password is correct');
      console.error('  • Try resetting your database password in Supabase Dashboard');
      console.error('  • Make sure there are no extra spaces in DATABASE_URL');
      console.error('  • Special characters in password might need URL encoding:');
      console.error('    Replace @ with %40, # with %23, etc.');
    }
    
    if (err.message.includes('timeout') || err.message.includes('ENOTFOUND')) {
      console.error('  • Check your internet connection');
      console.error('  • Verify the hostname is correct');
      console.error('  • Make sure the region is correct (us-east-1, eu-west-1, etc.)');
    }
    
    console.error('\n📚 Solution:');
    console.error('  1. Go to: https://supabase.com/dashboard/project/lsqiqrxxzhgikhvkgpbh/settings/database');
    console.error('  2. Copy the complete "Connection string" (URI format, Transaction mode)');
    console.error('  3. Replace your DATABASE_URL in .env.local with the copied string');
    console.error('  4. Run this script again: node scripts/test-db-connection.js\n');
    
    process.exit(1);
  });

