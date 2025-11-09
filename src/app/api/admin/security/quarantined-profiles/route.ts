import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabaseServer';
import { listQuarantinedProfiles } from '@/lib/security/quarantine';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';

/**
 * GET /api/admin/security/quarantined-profiles
 * List all quarantined profiles
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const adminClient = getAdminSupabaseClient();

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const profiles = await listQuarantinedProfiles(adminClient, {
      limit,
      offset,
    });

    return NextResponse.json<ApiResponse<{ profiles: typeof profiles; total: number }>>({
      success: true,
      data: {
        profiles,
        total: profiles.length,
      },
    });
  } catch (error) {
    console.error('Error fetching quarantined profiles:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

