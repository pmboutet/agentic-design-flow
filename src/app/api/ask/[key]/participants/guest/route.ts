import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabaseServer';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { getAskSessionByKey } from '@/lib/asks';
import type { ApiResponse } from '@/types';

// Validation schema for creating a guest participant
const CreateGuestParticipantSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  speaker: z.string().min(1, 'Speaker identifier is required'),
});

export interface GuestParticipantResponse {
  id: string;
  name: string;
  speaker: string;
}

// Type for the ASK session row we need
interface AskSessionRow {
  id: string;
  conversation_mode: string | null;
}

/**
 * POST /api/ask/[key]/participants/guest
 *
 * Creates a new guest participant for the ASK session.
 * This is used in consultant mode when a new speaker is detected and the user
 * chooses to create a new guest participant instead of assigning to an existing one.
 *
 * The guest participant:
 * - Is NOT a registered user (user_id is null)
 * - Has a participant_name set to the full name
 * - Is associated with the ASK session
 * - Has the speaker identifier stored for future reference
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    // Validate ask key format
    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedBody = CreateGuestParticipantSchema.parse(body);

    const adminClient = getAdminSupabaseClient();

    // Get the ASK session
    const { row: askSession, error: askError } = await getAskSessionByKey<AskSessionRow>(
      adminClient,
      key,
      'id, conversation_mode'
    );

    if (askError) {
      console.error('[GUEST-PARTICIPANT] Error fetching ASK session:', askError);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Failed to fetch ASK session'
      }, { status: 500 });
    }

    if (!askSession) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK session not found'
      }, { status: 404 });
    }

    // Verify this is a consultant mode session
    if (askSession.conversation_mode !== 'consultant') {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Guest participants can only be created in consultant mode'
      }, { status: 400 });
    }

    // Try to authenticate the user (via token or session)
    let userId: string | null = null;

    // Check for invite token in header
    const inviteToken = request.headers.get('X-Invite-Token');
    if (inviteToken) {
      // Get user from invite token
      const { data: participant } = await adminClient
        .from('ask_participants')
        .select('user_id')
        .eq('ask_session_id', askSession.id)
        .eq('invite_token', inviteToken)
        .maybeSingle();

      if (participant?.user_id) {
        userId = participant.user_id;
      }
    }

    // If no token, try session auth
    if (!userId) {
      const supabase = await createServerSupabaseClient();
      const authUser = await getCurrentUser();
      if (authUser) {
        // Get profile id from auth user
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_id', authUser.id)
          .eq('is_active', true)
          .maybeSingle();

        if (profile) {
          userId = profile.id;
        }
      }
    }

    // Create the full name
    const fullName = `${validatedBody.firstName.trim()} ${validatedBody.lastName.trim()}`;

    // Create the guest participant
    const { data: newParticipant, error: createError } = await adminClient
      .from('ask_participants')
      .insert({
        ask_session_id: askSession.id,
        user_id: null, // Guest participants don't have a user account
        participant_name: fullName,
        participant_email: null,
        role: 'guest',
        is_spokesperson: false,
        joined_at: new Date().toISOString(),
      })
      .select('id, participant_name')
      .single();

    if (createError) {
      console.error('[GUEST-PARTICIPANT] Error creating participant:', createError);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Failed to create guest participant'
      }, { status: 500 });
    }

    console.log('[GUEST-PARTICIPANT] Created guest participant:', {
      id: newParticipant.id,
      name: fullName,
      speaker: validatedBody.speaker,
      askSessionId: askSession.id,
    });

    return NextResponse.json<ApiResponse<GuestParticipantResponse>>({
      success: true,
      data: {
        id: newParticipant.id,
        name: fullName,
        speaker: validatedBody.speaker,
      }
    });

  } catch (error) {
    console.error('[GUEST-PARTICIPANT] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: error.errors.map(e => e.message).join(', ')
      }, { status: 400 });
    }

    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
