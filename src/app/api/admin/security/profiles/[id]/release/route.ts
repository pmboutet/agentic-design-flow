import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabaseServer';
import { releaseProfileFromQuarantine } from '@/lib/security/quarantine';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';

/**
 * POST /api/admin/security/profiles/[id]/release
 * Release a profile from quarantine
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const adminClient = getAdminSupabaseClient();
    const { id } = await params;

    await releaseProfileFromQuarantine(adminClient, id);

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Profile released from quarantine successfully',
    });
  } catch (error) {
    console.error('Error releasing profile from quarantine:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

