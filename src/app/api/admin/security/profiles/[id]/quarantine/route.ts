import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabaseServer';
import { quarantineProfile } from '@/lib/security/quarantine';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';

/**
 * POST /api/admin/security/profiles/[id]/quarantine
 * Manually quarantine a profile
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const adminClient = getAdminSupabaseClient();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'Manually quarantined by administrator';

    await quarantineProfile(adminClient, id, reason);

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Profile quarantined successfully',
    });
  } catch (error) {
    console.error('Error quarantining profile:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

