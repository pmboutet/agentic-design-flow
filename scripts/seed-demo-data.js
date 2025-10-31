#!/usr/bin/env node

/**
 * Seed demo data for testing
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const { parse } = require('pg-connection-string');
const { Client } = require('pg');

async function seedDemoData() {
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
    console.log('✅ Connected to database\n');

    // 1. Create a demo client (or get existing one)
    console.log('📦 Creating demo client...');
    const clientResult = await client.query(
      `INSERT INTO public.clients (name, status, email, company, industry)
       VALUES ('TechCorp Demo', 'active', 'contact@techcorp.demo', 'TechCorp', 'Technology')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`
    );

    let clientId;
    if (clientResult.rows.length > 0) {
      clientId = clientResult.rows[0].id;
      console.log(`✅ Client created/exists: ${clientResult.rows[0].name} (${clientId})`);
    } else {
      // Fallback: Client already exists, get it
      const existing = await client.query(
        `SELECT id, name FROM public.clients WHERE name = 'TechCorp Demo' LIMIT 1`
      );
      if (existing.rows.length > 0) {
        clientId = existing.rows[0].id;
        console.log(`ℹ️  Client already exists: ${existing.rows[0].name} (${clientId})`);
      } else {
        throw new Error('Failed to create or find demo client');
      }
    }

    // 2. Link current user to client
    console.log('\n👤 Linking your user to client...');
    const userResult = await client.query(
      `UPDATE public.profiles
       SET client_id = $1
       WHERE email = 'pierremboutet@gmail.com'
       RETURNING id, email, full_name`,
      [clientId]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      console.log(`✅ User linked: ${user.full_name || user.email}`);
    }

    // 3. Create a demo project
    console.log('\n📁 Creating demo project...');
    const projectResult = await client.query(
      `INSERT INTO public.projects (name, description, status, client_id, start_date, end_date, created_by)
       VALUES (
         'Innovation Workshop 2025',
         'Strategic innovation workshop to identify new product opportunities',
         'active',
         $1,
         NOW(),
         NOW() + INTERVAL '3 months',
         (SELECT id FROM public.profiles WHERE email = 'pierremboutet@gmail.com')
       )
       ON CONFLICT DO NOTHING
       RETURNING id, name`,
      [clientId]
    );

    let projectId;
    if (projectResult.rows.length > 0) {
      projectId = projectResult.rows[0].id;
      console.log(`✅ Project created: ${projectResult.rows[0].name} (${projectId})`);
    } else {
      const existing = await client.query(
        `SELECT id, name FROM public.projects WHERE name = 'Innovation Workshop 2025'`
      );
      if (existing.rows.length > 0) {
        projectId = existing.rows[0].id;
        console.log(`ℹ️  Project already exists: ${existing.rows[0].name} (${projectId})`);
      }
    }

    // 4. Add user as project member
    if (projectId) {
      console.log('\n👥 Adding you as project member...');
      await client.query(
        `INSERT INTO public.project_members (project_id, user_id, role, created_at)
         VALUES (
           $1,
           (SELECT id FROM public.profiles WHERE email = 'pierremboutet@gmail.com'),
           'facilitator',
           NOW()
         )
         ON CONFLICT DO NOTHING`,
        [projectId]
      );
      console.log('✅ You are now a project facilitator');
    }

    // 5. Create a demo challenge
    if (projectId) {
      console.log('\n🎯 Creating demo challenge...');
      const challengeResult = await client.query(
        `INSERT INTO public.challenges (
          project_id, name, description, status, priority, category, created_by
        )
        VALUES (
          $1,
          'How might we improve user onboarding?',
          'Explore ways to make the first-time user experience more engaging and reduce drop-off rates.',
          'open',
          'high',
          'User Experience',
          (SELECT id FROM public.profiles WHERE email = 'pierremboutet@gmail.com')
        )
        ON CONFLICT DO NOTHING
        RETURNING id, name`,
        [projectId]
      );

      if (challengeResult.rows.length > 0) {
        console.log(`✅ Challenge created: ${challengeResult.rows[0].name}`);
      } else {
        console.log('ℹ️  Demo challenge already exists');
      }
    }

    console.log('\n🎉 Demo data seeded successfully!');
    console.log('\n📊 Summary:');
    console.log('   ✅ 1 Client (TechCorp Demo)');
    console.log('   ✅ 1 User (you) linked to client');
    console.log('   ✅ 1 Project (Innovation Workshop 2025)');
    console.log('   ✅ 1 Project Member (you as facilitator)');
    console.log('   ✅ 1 Challenge (User Onboarding)');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedDemoData();

