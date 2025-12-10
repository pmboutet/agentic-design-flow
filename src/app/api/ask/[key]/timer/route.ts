import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { ApiResponse } from '@/types';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { getAskSessionByKey } from '@/lib/asks';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

interface AskSessionRow {
  id: string;
}

interface TimerUpdateRequest {
  elapsedActiveSeconds: number;
}

interface TimerResponse {
  elapsedActiveSeconds: number;
  participantId: string;
}

function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = ((error as PostgrestError).code ?? '').toString().toUpperCase();
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302') {
    return true;
  }

  const message = ((error as { message?: string }).message ?? '').toString().toLowerCase();
  return message.includes('permission denied') || message.includes('unauthorized');
}

function permissionDeniedResponse(): NextResponse<ApiResponse> {
  return NextResponse.json<ApiResponse>({
    success: false,
    error: "Accès non autorisé"
  }, { status: 403 });
}

/**
 * GET /api/ask/[key]/timer
 * Get the current elapsed time for the participant
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const isDevBypass = process.env.IS_DEV === 'true';

    let adminClient: SupabaseClient | null = null;
    const getAdminClient = async () => {
      if (!adminClient) {
        const { getAdminSupabaseClient } = await import('@/lib/supabaseAdmin');
        adminClient = getAdminSupabaseClient();
      }
      return adminClient;
    };

    let dataClient: SupabaseClient = supabase;
    let profileId: string | null = null;

    // Check for invite token
    const inviteToken = request.headers.get('X-Invite-Token');

    if (inviteToken) {
      const admin = await getAdminClient();
      const { data: participant, error: tokenError } = await admin
        .from('ask_participants')
        .select('id, user_id, ask_session_id, elapsed_active_seconds')
        .eq('invite_token', inviteToken)
        .maybeSingle();

      if (!tokenError && participant?.user_id) {
        profileId = participant.user_id;
        dataClient = admin;

        // Verify this token is for the right ASK
        const { row: askRow } = await getAskSessionByKey<AskSessionRow>(dataClient, key, 'id');
        if (askRow && participant.ask_session_id === askRow.id) {
          return NextResponse.json<ApiResponse<TimerResponse>>({
            success: true,
            data: {
              elapsedActiveSeconds: participant.elapsed_active_seconds ?? 0,
              participantId: participant.id,
            }
          });
        }
      }
    }

    // Regular auth flow
    if (!isDevBypass) {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult?.user) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Authentification requise"
        }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_id', userResult.user.id)
        .single();

      if (!profile) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Profil utilisateur introuvable"
        }, { status: 401 });
      }

      profileId = profile.id;
    } else {
      dataClient = await getAdminClient();
    }

    // Get the ASK session
    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(dataClient, key, 'id');
    if (askError || !askRow) {
      if (isPermissionDenied(askError)) {
        return permissionDeniedResponse();
      }
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable'
      }, { status: 404 });
    }

    // Get participant's elapsed time
    let participantQuery = dataClient
      .from('ask_participants')
      .select('id, elapsed_active_seconds')
      .eq('ask_session_id', askRow.id);

    if (profileId) {
      participantQuery = participantQuery.eq('user_id', profileId);
    }

    const { data: participant, error: participantError } = await participantQuery.maybeSingle();

    if (participantError) {
      if (isPermissionDenied(participantError)) {
        return permissionDeniedResponse();
      }
      throw participantError;
    }

    if (!participant) {
      return NextResponse.json<ApiResponse<TimerResponse>>({
        success: true,
        data: {
          elapsedActiveSeconds: 0,
          participantId: '',
        }
      });
    }

    return NextResponse.json<ApiResponse<TimerResponse>>({
      success: true,
      data: {
        elapsedActiveSeconds: participant.elapsed_active_seconds ?? 0,
        participantId: participant.id,
      }
    });
  } catch (error) {
    console.error('Error getting timer:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

/**
 * PATCH /api/ask/[key]/timer
 * Update the elapsed time for the participant
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    const body: TimerUpdateRequest = await request.json();

    if (typeof body.elapsedActiveSeconds !== 'number' || body.elapsedActiveSeconds < 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'elapsedActiveSeconds must be a non-negative number'
      }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const isDevBypass = process.env.IS_DEV === 'true';

    let adminClient: SupabaseClient | null = null;
    const getAdminClient = async () => {
      if (!adminClient) {
        const { getAdminSupabaseClient } = await import('@/lib/supabaseAdmin');
        adminClient = getAdminSupabaseClient();
      }
      return adminClient;
    };

    let dataClient: SupabaseClient = supabase;
    let profileId: string | null = null;
    let participantId: string | null = null;

    // Check for invite token
    const inviteToken = request.headers.get('X-Invite-Token');

    if (inviteToken) {
      const admin = await getAdminClient();
      const { data: participant, error: tokenError } = await admin
        .from('ask_participants')
        .select('id, user_id, ask_session_id')
        .eq('invite_token', inviteToken)
        .maybeSingle();

      if (!tokenError && participant?.user_id) {
        profileId = participant.user_id;
        participantId = participant.id;
        dataClient = admin;
      }
    }

    // Regular auth flow
    if (!profileId && !isDevBypass) {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult?.user) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Authentification requise"
        }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_id', userResult.user.id)
        .single();

      if (!profile) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Profil utilisateur introuvable"
        }, { status: 401 });
      }

      profileId = profile.id;
    } else if (isDevBypass && !profileId) {
      dataClient = await getAdminClient();
    }

    // Get the ASK session
    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(dataClient, key, 'id');
    if (askError || !askRow) {
      if (isPermissionDenied(askError)) {
        return permissionDeniedResponse();
      }
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable'
      }, { status: 404 });
    }

    // Get participant if not already retrieved from invite token
    if (!participantId && profileId) {
      const { data: participant, error: participantError } = await dataClient
        .from('ask_participants')
        .select('id')
        .eq('ask_session_id', askRow.id)
        .eq('user_id', profileId)
        .maybeSingle();

      if (participantError) {
        if (isPermissionDenied(participantError)) {
          return permissionDeniedResponse();
        }
        throw participantError;
      }

      if (participant) {
        participantId = participant.id;
      }
    }

    // In dev mode without a participant, try to find the first participant
    if (isDevBypass && !participantId) {
      const admin = await getAdminClient();
      const { data: anyParticipant } = await admin
        .from('ask_participants')
        .select('id')
        .eq('ask_session_id', askRow.id)
        .limit(1)
        .maybeSingle();

      if (anyParticipant) {
        participantId = anyParticipant.id;
        dataClient = admin;
      }
    }

    if (!participantId) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Participant introuvable pour cette session'
      }, { status: 404 });
    }

    // Update the elapsed time
    const { error: updateError } = await dataClient
      .from('ask_participants')
      .update({ elapsed_active_seconds: Math.floor(body.elapsedActiveSeconds) })
      .eq('id', participantId);

    if (updateError) {
      if (isPermissionDenied(updateError)) {
        return permissionDeniedResponse();
      }
      throw updateError;
    }

    return NextResponse.json<ApiResponse<TimerResponse>>({
      success: true,
      data: {
        elapsedActiveSeconds: Math.floor(body.elapsedActiveSeconds),
        participantId,
      }
    });
  } catch (error) {
    console.error('Error updating timer:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
