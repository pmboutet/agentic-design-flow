import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  try {
    // Check for authorization header or query param
    const authHeader = request.headers.get('authorization');
    const authQuery = request.nextUrl.searchParams.get('token');
    const expectedToken = process.env.MIGRATION_TOKEN || 'migration-secret';

    if (authHeader !== `Bearer ${expectedToken}` && authQuery !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized. Provide ?token=... or Authorization: Bearer ...' },
        { status: 401 }
      );
    }

    // Run migration status first
    const { stdout: statusOutput } = await execAsync('node scripts/migrate.js status');
    
    // Run migrations
    const { stdout: migrateOutput } = await execAsync('node scripts/migrate.js up');

    return NextResponse.json({
      success: true,
      status: statusOutput,
      migrations: migrateOutput,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    
    return NextResponse.json(
      { 
        error: 'Migration failed', 
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check for authorization
    const authHeader = request.headers.get('authorization');
    const authQuery = request.nextUrl.searchParams.get('token');
    const expectedToken = process.env.MIGRATION_TOKEN || 'migration-secret';

    if (authHeader !== `Bearer ${expectedToken}` && authQuery !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized. Provide ?token=... or Authorization: Bearer ...' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action = 'up', version } = body;

    let command = 'node scripts/migrate.js';
    if (action === 'down' && version) {
      command += ` down ${version}`;
    } else if (action === 'status') {
      command += ' status';
    } else {
      command += ' up';
    }

    const { stdout } = await execAsync(command);

    return NextResponse.json({
      success: true,
      action,
      version,
      output: stdout,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    
    return NextResponse.json(
      { 
        error: 'Migration failed', 
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
