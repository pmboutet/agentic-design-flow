import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || 'migration-secret';

type MigrationModule = typeof import('../../../../scripts/migrate-core');

type LoggerOverrides = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

type MigrationOptions = {
  collect?: boolean;
  logger?: LoggerOverrides;
};

async function loadMigrationModule(): Promise<MigrationModule> {
  const module = await import('../../../../scripts/migrate-core');
  return module;
}

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const authQuery = request.nextUrl.searchParams.get('token');
  return authHeader === `Bearer ${MIGRATION_TOKEN}` || authQuery === MIGRATION_TOKEN;
}

function createCollector() {
  const lines: string[] = [];
  const logger: LoggerOverrides = {
    info: (message: string) => {
      lines.push(message);
    },
    warn: (message: string) => {
      lines.push(message);
    },
    error: (message: string) => {
      lines.push(message);
    }
  };

  return {
    logger,
    output: () => lines.join('\n')
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized. Provide ?token=... or Authorization: Bearer ...' },
        { status: 401 }
      );
    }

    const migrations = await loadMigrationModule();

    const statusCollector = createCollector();
    const statusResult = await migrations.migrationStatus({
      collect: true,
      logger: statusCollector.logger
    } as MigrationOptions);

    const migrateCollector = createCollector();
    const migrateResult = await migrations.migrateUp({
      collect: true,
      logger: migrateCollector.logger
    } as MigrationOptions);

    return NextResponse.json({
      success: true,
      status: statusResult.output ?? statusCollector.output(),
      migrations: migrateResult.output ?? migrateCollector.output(),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Migration error:', error);

    return NextResponse.json(
      {
        error: 'Migration failed',
        details: error?.message ?? String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Unauthorized. Provide ?token=... or Authorization: Bearer ...' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action = 'up', version } = body;

    const migrations = await loadMigrationModule();
    const collector = createCollector();

    const args: string[] = [];
    if (action === 'down') {
      args.push('down');
      if (version) {
        args.push(String(version));
      }
    } else if (action === 'status') {
      args.push('status');
    } else {
      args.push('up');
    }

    const result = await migrations.runCommand(args, {
      collect: true,
      logger: collector.logger
    } as MigrationOptions);

    return NextResponse.json({
      success: true,
      action,
      version,
      output: result.output ?? collector.output(),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Migration error:', error);

    return NextResponse.json(
      {
        error: 'Migration failed',
        details: error?.message ?? String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
