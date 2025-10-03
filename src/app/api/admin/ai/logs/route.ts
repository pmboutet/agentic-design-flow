import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { listAgentLogs } from '@/lib/ai/logs';
import { parseErrorMessage } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminSupabaseClient();
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.max(1, Math.min(200, Number(limitParam))) : 100;

    const logs = await listAgentLogs(supabase, { limit });

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('Unable to list AI agent logs', error);
    return NextResponse.json({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}
