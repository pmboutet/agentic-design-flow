import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: projectId } = params;
    const supabase = getAdminSupabaseClient();

    const { data, error } = await supabase
      .from('challenges')
      .select('id, name, description, status')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<Array<{ id: string; name: string; description: string | null; status: string | null }>>>({
      success: true,
      data: (data ?? []).map(challenge => ({
        id: challenge.id,
        name: challenge.name ?? '',
        description: challenge.description ?? null,
        status: challenge.status ?? null,
      })),
    });
  } catch (error) {
    console.error('Error fetching challenges for project', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

