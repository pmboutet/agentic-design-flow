import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { listAgents } from '@/lib/ai/agents';
import { PROMPT_VARIABLES } from '@/lib/ai/constants';

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const agents = await listAgents(supabase, { includeModels: true });

    return NextResponse.json({
      success: true,
      data: {
        agents,
        variables: PROMPT_VARIABLES,
      },
    });
  } catch (error) {
    console.error('Unable to list AI agents', error);
    return NextResponse.json({
      success: false,
      error: (error instanceof Error ? error.message : 'Unexpected error while loading AI agents'),
    }, { status: 500 });
  }
}
