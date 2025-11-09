import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabaseServer';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';

/**
 * POST /api/admin/security/detections/[id]/review
 * Mark a security detection as reviewed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdmin();
    const adminClient = getAdminSupabaseClient();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const status = body.status || 'reviewed'; // reviewed, resolved, false_positive

    // Get current user's profile ID
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (!profile) {
      throw new Error('Profile not found');
    }

    const { error } = await adminClient
      .from('security_detections')
      .update({
        status,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update detection: ${error.message}`);
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Detection marked as reviewed',
    });
  } catch (error) {
    console.error('Error reviewing detection:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

