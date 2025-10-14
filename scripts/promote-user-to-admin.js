#!/usr/bin/env node

/**
 * Promote a user to full_admin role
 * Usage: node scripts/promote-user-to-admin.js <email>
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const { parse } = require('pg-connection-string');
const { Client } = require('pg');

async function promoteUserToAdmin(email) {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env.local');
    process.exit(1);
  }

  const config = parse(databaseUrl);
  const sslConfig = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' 
    ? { rejectUnauthorized: false }
    : undefined;

  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: sslConfig,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Update user role to full_admin
    const result = await client.query(
      `UPDATE public.profiles 
       SET role = 'full_admin' 
       WHERE email = $1 
       RETURNING id, email, role, full_name`,
      [email]
    );

    if (result.rows.length === 0) {
      console.error(`❌ No user found with email: ${email}`);
      process.exit(1);
    }

    const user = result.rows[0];
    console.log('\n✅ User promoted to full_admin:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.full_name || 'N/A'}`);
    console.log(`   Role: ${user.role}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Get email from command line args
const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/promote-user-to-admin.js <email>');
  console.error('Example: node scripts/promote-user-to-admin.js pierremboutet@gmail.com');
  process.exit(1);
}

promoteUserToAdmin(email);

