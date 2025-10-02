#!/usr/bin/env node

/**
 * Database migration runner for Supabase/PostgreSQL.
 *
 * Usage:
 *   node scripts/migrate.js up        # apply pending migrations
 *   node scripts/migrate.js down 002  # rollback a specific migration (optional)
 *   node scripts/migrate.js status    # list applied and pending migrations
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
require('dotenv').config();

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

async function getClient() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_MIGRATIONS_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL (or POSTGRES_URL / SUPABASE_MIGRATIONS_URL) must be set to run migrations.');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: getSSLConfig() });
  client.on('error', (error) => {
    console.error('Database client error:', error);
    process.exit(1);
  });
  await client.connect();
  return client;
}

function getSSLConfig() {
  const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
  if (sslMode === 'disable') return false;
  
  // Supabase/managed PostgreSQL requires SSL
  // Always accept self-signed certificates unless explicitly disabled
  return { 
    rejectUnauthorized: false
  };
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      version VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      hash VARCHAR(64) NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function readMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const contents = fs.readFileSync(filePath, 'utf8');
      const [version, ...nameParts] = file.replace('.sql', '').split('_');
      const name = nameParts.join('_');
      const hash = require('crypto').createHash('sha256').update(contents).digest('hex');
      return { version, name, file, filePath, contents, hash };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

async function appliedMigrations(client) {
  const { rows } = await client.query(
    `SELECT version, name, hash FROM public.${MIGRATIONS_TABLE} ORDER BY version ASC;`
  );
  return rows;
}

async function migrateUp() {
  const client = await getClient();
  try {
    await ensureMigrationsTable(client);
    const migrations = readMigrations();
    const applied = await appliedMigrations(client);
    const appliedVersions = new Set(applied.map((m) => m.version));

    const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));

    if (pending.length === 0) {
      console.log('✅ No pending migrations.');
      return;
    }

    for (const migration of pending) {
      console.log(`➡️  Applying migration ${migration.version} (${migration.file})`);
      await runMigration(client, migration);
      console.log(`✅ Migration ${migration.version} applied.`);
    }
  } finally {
    await client.end();
  }
}

async function runMigration(client, migration) {
  await client.query('BEGIN');
  try {
    await client.query('LOCK TABLE public.' + MIGRATIONS_TABLE + ' IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await client.query(
      `SELECT hash FROM public.${MIGRATIONS_TABLE} WHERE version = $1`,
      [migration.version]
    );

    if (rows.length > 0) {
      const appliedHash = rows[0].hash;
      if (appliedHash !== migration.hash) {
        throw new Error(
          `Hash mismatch for migration ${migration.version}.\n` +
            `Applied hash: ${appliedHash}\nCurrent hash: ${migration.hash}\n` +
            'Create a new migration file instead of editing an applied one.'
        );
      }
      await client.query('ROLLBACK');
      console.log(`ℹ️  Migration ${migration.version} already applied.`);
      return;
    }

    await client.query(migration.contents);
    await client.query(
      `INSERT INTO public.${MIGRATIONS_TABLE} (version, name, hash) VALUES ($1, $2, $3);`,
      [migration.version, migration.name, migration.hash]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Failed to apply migration ${migration.version}:`, error.message);
    throw error;
  }
}

async function migrationStatus() {
  const client = await getClient();
  try {
    await ensureMigrationsTable(client);
    const migrations = readMigrations();
    const applied = await appliedMigrations(client);

    const appliedMap = new Map(applied.map((m) => [m.version, m]));

    console.log('\nMigration status:');
    for (const migration of migrations) {
      if (appliedMap.has(migration.version)) {
        console.log(`✅ ${migration.version} ${migration.name}`);
      } else {
        console.log(`⬜ ${migration.version} ${migration.name}`);
      }
    }

    const extra = applied.filter((m) => !migrations.find((mig) => mig.version === m.version));
    if (extra.length > 0) {
      console.log('\n⚠️  Applied migrations missing from filesystem:');
      for (const migration of extra) {
        console.log(`   - ${migration.version} ${migration.name}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function migrateDown(targetVersion) {
  if (!targetVersion) {
    console.error('Specify the migration version to roll back, e.g. node scripts/migrate.js down 002');
    process.exit(1);
  }

  const client = await getClient();
  try {
    await ensureMigrationsTable(client);
    const migration = readMigrations().find((m) => m.version === targetVersion);
    if (!migration) {
      throw new Error(`Migration ${targetVersion} not found.`);
    }

    console.warn('⚠️  Down migrations rely on explicit -- down statements in the SQL file.');
    console.warn('   Ensure your SQL contains a "-- //@UNDO" section for rollback logic.');

    const fileContents = migration.contents.split(/--\s*\/\/\s*@UNDO/);
    if (fileContents.length < 2) {
      throw new Error(`Migration ${targetVersion} does not define a -- //@UNDO section.`);
    }

    const downSql = fileContents[1];
    await client.query('BEGIN');
    try {
      await client.query('LOCK TABLE public.' + MIGRATIONS_TABLE + ' IN SHARE ROW EXCLUSIVE MODE');
      await client.query(downSql);
      await client.query(`DELETE FROM public.${MIGRATIONS_TABLE} WHERE version = $1;`, [targetVersion]);
      await client.query('COMMIT');
      console.log(`✅ Rolled back migration ${targetVersion}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const command = process.argv[2];
  switch (command) {
    case 'up':
    case undefined:
      await migrateUp();
      break;
    case 'status':
      await migrationStatus();
      break;
    case 'down':
      await migrateDown(process.argv[3]);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log('Usage: node scripts/migrate.js [up|status|down <version>]');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

