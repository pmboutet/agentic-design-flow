#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
require('dotenv').config();

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

function createLogger(options = {}) {
  const { logger = {}, collect = true } = options;
  const lines = collect ? [] : undefined;

  const baseInfo = typeof logger.info === 'function' ? logger.info : console.log;
  const baseWarn = typeof logger.warn === 'function' ? logger.warn : console.warn;
  const baseError = typeof logger.error === 'function' ? logger.error : console.error;

  const normaliseMessage = (message) => {
    if (message instanceof Error) {
      return message.stack || message.message;
    }
    if (typeof message === 'string') {
      return message;
    }
    try {
      return JSON.stringify(message);
    } catch (error) {
      return String(message);
    }
  };

  const push = (fn, message) => {
    const text = normaliseMessage(message);
    fn(text);
    if (lines) {
      lines.push(text);
    }
  };

  return {
    info(message) {
      push(baseInfo, message);
    },
    warn(message) {
      push(baseWarn, message);
    },
    error(message) {
      push(baseError, message);
    },
    getOutput() {
      return lines ? lines.join('\n') : '';
    },
    getLines() {
      return lines ? [...lines] : [];
    }
  };
}

const TRUTHY = new Set(['1', 'true', 't', 'yes', 'y', 'on']);
const FALSY = new Set(['0', 'false', 'f', 'no', 'n', 'off']);

function parseBoolean(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalised = String(value).trim().toLowerCase();
  if (TRUTHY.has(normalised)) return true;
  if (FALSY.has(normalised)) return false;
  return undefined;
}

function readBufferFromFile(maybePath) {
  if (!maybePath) return undefined;
  const resolved = path.isAbsolute(maybePath)
    ? maybePath
    : path.resolve(process.cwd(), maybePath);
  if (!fs.existsSync(resolved)) {
    return undefined;
  }
  return fs.readFileSync(resolved, 'utf8');
}

function readBufferFromBase64(value) {
  if (!value) return undefined;
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch (error) {
    return undefined;
  }
}

function resolveSSLMaterial(primaryEnv, base64Env) {
  const fromFile = readBufferFromFile(process.env[primaryEnv]);
  if (fromFile) return fromFile;
  return readBufferFromBase64(process.env[base64Env]);
}

function getSSLConfig() {
  const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
  if (sslMode === 'disable') return false;

  const ssl = {};

  const rejectFromEnv =
    parseBoolean(process.env.PGSSLREJECTUNAUTHORIZED) ??
    parseBoolean(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED);
  if (rejectFromEnv !== undefined) {
    ssl.rejectUnauthorized = rejectFromEnv;
  }

  const ca =
    resolveSSLMaterial('PGSSLROOTCERT', 'PGSSLROOTCERT_BASE64') ||
    resolveSSLMaterial('DATABASE_SSL_ROOT_CERT', 'DATABASE_SSL_ROOT_CERT_BASE64');
  const cert =
    resolveSSLMaterial('PGSSLCERT', 'PGSSLCERT_BASE64') ||
    resolveSSLMaterial('DATABASE_SSL_CERT', 'DATABASE_SSL_CERT_BASE64');
  const key =
    resolveSSLMaterial('PGSSLKEY', 'PGSSLKEY_BASE64') ||
    resolveSSLMaterial('DATABASE_SSL_KEY', 'DATABASE_SSL_KEY_BASE64');

  if (ca) {
    ssl.ca = ca;
  }
  if (cert) {
    ssl.cert = cert;
  }
  if (key) {
    ssl.key = key;
  }

  if (Object.keys(ssl).length === 0) {
    return { rejectUnauthorized: false };
  }

  if (ssl.rejectUnauthorized === undefined) {
    ssl.rejectUnauthorized = true;
  }

  return ssl;
}

async function getClient() {
  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_MIGRATIONS_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL (or POSTGRES_URL / SUPABASE_MIGRATIONS_URL) must be set to run migrations.');
  }

  const client = new Client({ connectionString, ssl: getSSLConfig() });
  client.on('error', (error) => {
    throw error;
  });
  await client.connect();
  return client;
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
      let contents = fs.readFileSync(filePath, 'utf8');
      
      // Extract only the "up" migration (before //@UNDO marker)
      const undoMarkerIndex = contents.indexOf('//@UNDO');
      if (undoMarkerIndex !== -1) {
        contents = contents.substring(0, undoMarkerIndex).trim();
      }
      
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

async function runMigration(client, migration, logger) {
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
          `Hash mismatch for migration ${migration.version}.\nApplied hash: ${appliedHash}\nCurrent hash: ${migration.hash}\nCreate a new migration file instead of editing an applied one.`
        );
      }
      await client.query('ROLLBACK');
      logger.info(`ℹ️  Migration ${migration.version} already applied.`);
      return false;
    }

    await client.query(migration.contents);
    await client.query(
      `INSERT INTO public.${MIGRATIONS_TABLE} (version, name, hash) VALUES ($1, $2, $3);`,
      [migration.version, migration.name, migration.hash]
    );
    await client.query('COMMIT');
    logger.info(`✅ Migration ${migration.version} applied.`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`❌ Failed to apply migration ${migration.version}: ${error.message}`);
    throw error;
  }
}

async function migrateUp(options = {}) {
  const logger = createLogger(options);
  const client = await getClient();
  try {
    await ensureMigrationsTable(client);
    const migrations = readMigrations();
    const applied = await appliedMigrations(client);
    const appliedVersions = new Set(applied.map((m) => m.version));

    const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));

    if (pending.length === 0) {
      logger.info('✅ No pending migrations.');
      return { output: logger.getOutput(), pending: [] };
    }

    const appliedVersionsList = [];
    for (const migration of pending) {
      logger.info(`➡️  Applying migration ${migration.version} (${migration.file})`);
      const appliedMigration = await runMigration(client, migration, logger);
      if (appliedMigration) {
        appliedVersionsList.push(migration.version);
      }
    }

    return { output: logger.getOutput(), pending: appliedVersionsList };
  } finally {
    await client.end();
  }
}

async function migrationStatus(options = {}) {
  const logger = createLogger(options);
  const client = await getClient();
  try {
    await ensureMigrationsTable(client);
    const migrations = readMigrations();
    const applied = await appliedMigrations(client);

    const appliedMap = new Map(applied.map((m) => [m.version, m]));

    logger.info('\nMigration status:');
    for (const migration of migrations) {
      if (appliedMap.has(migration.version)) {
        logger.info(`✅ ${migration.version} ${migration.name}`);
      } else {
        logger.info(`⬜ ${migration.version} ${migration.name}`);
      }
    }

    const extra = applied.filter((m) => !migrations.find((mig) => mig.version === m.version));
    if (extra.length > 0) {
      logger.warn('\n⚠️  Applied migrations missing from filesystem:');
      for (const migration of extra) {
        logger.warn(`   - ${migration.version} ${migration.name}`);
      }
    }

    return { output: logger.getOutput(), applied: applied.map((m) => m.version) };
  } finally {
    await client.end();
  }
}

async function migrateDown(targetVersion, options = {}) {
  if (!targetVersion) {
    throw new Error('Specify the migration version to roll back, e.g. node scripts/migrate.js down 002');
  }

  const logger = createLogger(options);
  const client = await getClient();
  try {
    await ensureMigrationsTable(client);
    const migration = readMigrations().find((m) => m.version === targetVersion);
    if (!migration) {
      throw new Error(`Migration ${targetVersion} not found.`);
    }

    logger.warn('⚠️  Down migrations rely on explicit -- //@UNDO statements in the SQL file.');
    logger.warn('   Ensure your SQL contains a "-- //@UNDO" section for rollback logic.');

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
      logger.info(`✅ Rolled back migration ${targetVersion}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    return { output: logger.getOutput() };
  } finally {
    await client.end();
  }
}

async function runCommand(argv = [], options = {}) {
  const logger = options.logger || {};
  const command = argv[0] || 'up';

  switch (command) {
    case 'up':
      return migrateUp({ logger, collect: options.collect });
    case 'status':
      return migrationStatus({ logger, collect: options.collect });
    case 'down':
      return migrateDown(argv[1], { logger, collect: options.collect });
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function runCLI(argv = process.argv.slice(2)) {
  try {
    await runCommand(argv, { collect: false });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  MIGRATIONS_DIR,
  MIGRATIONS_TABLE,
  getClient,
  ensureMigrationsTable,
  readMigrations,
  appliedMigrations,
  migrateUp,
  migrateDown,
  migrationStatus,
  runCommand,
  runCLI
};
