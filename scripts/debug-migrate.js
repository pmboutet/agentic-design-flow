#!/usr/bin/env node

console.log('Starting debug...');

try {
  const path = require('path');
  console.log('✅ path loaded');
  
  const fs = require('fs');
  console.log('✅ fs loaded');
  
  const { Client } = require('pg');
  console.log('✅ pg loaded');
  
  console.log('Loading dotenv...');
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
  console.log('✅ .env.local loaded');
  
  require('dotenv').config();
  console.log('✅ .env loaded');
  
  console.log('\n📋 Environment variables:');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
  console.log('POSTGRES_URL:', process.env.POSTGRES_URL ? '✅ Set' : '❌ Not set');
  console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Not set');
  
  if (process.env.DATABASE_URL) {
    console.log('\n🔍 Testing DATABASE_URL parsing...');
    try {
      const url = new URL(process.env.DATABASE_URL);
      console.log('  Protocol:', url.protocol);
      console.log('  Host:', url.host);
      console.log('  Pathname:', url.pathname);
      console.log('  SearchParams:', url.searchParams ? 'Present' : 'undefined');
      console.log('✅ URL parsed successfully');
    } catch (err) {
      console.error('❌ Error parsing URL:', err.message);
    }
  }
  
  console.log('\n🔌 Testing database connection...');
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL
  });
  
  console.log('✅ Client created');
  
  client.connect()
    .then(() => {
      console.log('✅ Connected to database');
      return client.query('SELECT NOW()');
    })
    .then(result => {
      console.log('✅ Query executed:', result.rows[0].now);
      return client.end();
    })
    .then(() => {
      console.log('✅ Connection closed');
      console.log('\n✅ All tests passed!');
    })
    .catch(err => {
      console.error('❌ Database error:', err.message);
      process.exit(1);
    });
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

