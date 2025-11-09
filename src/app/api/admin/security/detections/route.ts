import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabaseServer';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';

interface SecurityDetectionRow {
  id: string;
  message_id: string;
  profile_id: string | null;
  detection_type: string;
  severity: string;
  matched_patterns: Record<string, unknown>;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface SecurityDetection {
  id: string;
  messageId: string;
  profileId: string | null;
  detectionType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  matchedPatterns: Record<string, unknown>;
  status: 'pending' | 'reviewed' | 'resolved' | 'false_positive';
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

function mapDetectionRow(row: SecurityDetectionRow): SecurityDetection {
  return {
    id: row.id,
    messageId: row.message_id,
    profileId: row.profile_id,
    detectionType: row.detection_type,
    severity: row.severity as SecurityDetection['severity'],
    matchedPatterns: row.matched_patterns ?? {},
    status: row.status as SecurityDetection['status'],
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/admin/security/detections
 * List security detections with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const adminClient = getAdminSupabaseClient();

    const searchParams = request.nextUrl.searchParams;
    const detectionType = searchParams.get('detectionType');
    const severity = searchParams.get('severity');
    const status = searchParams.get('status');
    const profileId = searchParams.get('profileId');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = adminClient
      .from('security_detections')
      .select('*')
      .order('created_at', { ascending: false });

    if (detectionType) {
      query = query.eq('detection_type', detectionType);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (profileId) {
      query = query.eq('profile_id', profileId);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch security detections: ${error.message}`);
    }

    const detections = (data ?? []).map(mapDetectionRow);

    return NextResponse.json<ApiResponse<{ detections: SecurityDetection[]; total: number }>>({
      success: true,
      data: {
        detections,
        total: detections.length,
      },
    });
  } catch (error) {
    console.error('Error fetching security detections:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

