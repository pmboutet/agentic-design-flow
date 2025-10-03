import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, Challenge } from '@/types';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { getAskSessionByKey } from '@/lib/asks';

interface AskSessionRow {
  id: string;
  challenge_id?: string | null;
}

type ChallengeUpdatePayload = Partial<Pick<Challenge, 'name' | 'updatedAt'>> & {
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  category?: string | null;
  dueDate?: string | null;
  assignedTo?: string | null;
};

function buildChallengeUpdate(data: ChallengeUpdatePayload) {
  const payload: Record<string, unknown> = {};

  if (typeof data.name === 'string') {
    payload.name = data.name;
  }
  if (typeof data.description === 'string' || data.description === null) {
    payload.description = data.description;
  }
  if (typeof data.status === 'string') {
    payload.status = data.status;
  }
  if (typeof data.priority === 'string') {
    payload.priority = data.priority;
  }
  if (typeof data.category === 'string' || data.category === null) {
    payload.category = data.category;
  }
  if (typeof data.dueDate === 'string' || data.dueDate === null) {
    payload.due_date = data.dueDate;
  }
  if (typeof data.assignedTo === 'string' || data.assignedTo === null) {
    payload.assigned_to = data.assignedTo;
  }

  payload.updated_at = new Date().toISOString();

  return payload;
}

/**
 * PUT /api/challenges/[key] - Update challenge linked to an ASK without external webhooks
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const { key } = params;

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    const body = (await request.json()) as ChallengeUpdatePayload;

    const supabase = getAdminSupabaseClient();

    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(
      supabase,
      key,
      'id, challenge_id'
    );

    if (askError) {
      throw askError;
    }

    if (!askRow || !askRow.challenge_id) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Aucun challenge associé à cette ASK'
      }, { status: 404 });
    }

    const updatePayload = buildChallengeUpdate(body);

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Aucune donnée valide fournie pour la mise à jour'
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('challenges')
      .update(updatePayload)
      .eq('id', askRow.challenge_id)
      .select('id, name, description, status, priority, category, due_date, assigned_to, updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data,
      message: 'Challenge mis à jour avec succès'
    });

  } catch (error) {
    console.error('Error updating challenge internally:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
