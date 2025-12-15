import { NextRequest, NextResponse } from 'next/server';
import { type ApiResponse } from '@/types';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user_id: string;
}

/**
 * POST /api/ask/token/[token]/auth
 *
 * Creates a real Supabase auth session for a participant using their invite token.
 * This allows Realtime subscriptions to work with RLS policies.
 *
 * Flow:
 * 1. Validate the invite token
 * 2. Get or create a Supabase auth user for the participant
 * 3. Generate a magic link and immediately verify it to create a session
 * 4. Return the session tokens
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();

    // Find the participant by invite token using RPC (bypasses RLS)
    const { data: rpcResult, error: participantError } = await supabase
      .rpc('get_participant_by_token', { p_token: token })
      .maybeSingle<{
        participant_id: string;
        user_id: string | null;
        participant_email: string | null;
        participant_name: string | null;
        invite_token: string;
        role: string | null;
        is_spokesperson: boolean;
        ask_session_id: string;
      }>();

    if (participantError) {
      console.error('[token/auth] Error finding participant:', participantError);
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Database error' },
        { status: 500 }
      );
    }

    if (!rpcResult) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Invalid invite token' },
        { status: 404 }
      );
    }

    // Map RPC result to expected format
    const participant = {
      id: rpcResult.participant_id,
      ask_session_id: rpcResult.ask_session_id,
      participant_email: rpcResult.participant_email,
      participant_name: rpcResult.participant_name,
      user_id: rpcResult.user_id,
    };

    let userId: string;
    let authEmail: string;

    // Check if the participant has a linked profile with an existing auth_id
    // If so, use that existing auth user instead of creating a new one
    if (participant.user_id) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('auth_id, email')
        .eq('id', participant.user_id)
        .maybeSingle();

      if (existingProfile?.auth_id && existingProfile?.email) {
        // Profile already has an auth user - use it
        console.log('[token/auth] Using existing auth user from profile:', existingProfile.auth_id);
        userId = existingProfile.auth_id;
        authEmail = existingProfile.email;
      } else {
        // Profile exists but has no auth_id - create new auth user and link it
        authEmail = participant.participant_email || existingProfile?.email ||
          `participant-${participant.id}@agentic-ask.local`;

        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: authEmail,
          email_confirm: true,
          user_metadata: {
            participant_id: participant.id,
            participant_name: participant.participant_name,
            ask_session_id: participant.ask_session_id,
          },
        });

        if (createError) {
          // User likely already exists - try to find them
          if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
            const { data: existingUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const existingUser = existingUsers?.users?.find(u => u.email === authEmail);
            if (existingUser) {
              userId = existingUser.id;
            } else {
              console.error('[token/auth] User exists but could not be found:', createError);
              return NextResponse.json<ApiResponse>(
                { success: false, error: 'Failed to find auth user' },
                { status: 500 }
              );
            }
          } else {
            console.error('[token/auth] Error creating user:', createError);
            return NextResponse.json<ApiResponse>(
              { success: false, error: 'Failed to create auth user' },
              { status: 500 }
            );
          }
        } else {
          userId = newUser.user.id;
        }

        // Link the new auth user to the profile
        await supabase
          .from('profiles')
          .update({ auth_id: userId })
          .eq('id', participant.user_id)
          .is('auth_id', null);
      }
    } else {
      // No linked profile - create a standalone auth user
      authEmail = participant.participant_email ||
        `participant-${participant.id}@agentic-ask.local`;

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: authEmail,
        email_confirm: true,
        user_metadata: {
          participant_id: participant.id,
          participant_name: participant.participant_name,
          ask_session_id: participant.ask_session_id,
        },
      });

      if (createError) {
        if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
          const { data: existingUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const existingUser = existingUsers?.users?.find(u => u.email === authEmail);
          if (existingUser) {
            userId = existingUser.id;
          } else {
            console.error('[token/auth] User exists but could not be found:', createError);
            return NextResponse.json<ApiResponse>(
              { success: false, error: 'Failed to find auth user' },
              { status: 500 }
            );
          }
        } else {
          console.error('[token/auth] Error creating user:', createError);
          return NextResponse.json<ApiResponse>(
            { success: false, error: 'Failed to create auth user' },
            { status: 500 }
          );
        }
      } else {
        userId = newUser.user.id;
      }
    }

    // Generate a magic link for the user
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[token/auth] Error generating magic link:', linkError);
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Failed to generate authentication link' },
        { status: 500 }
      );
    }

    // Verify the OTP to create a session
    // The hashed_token from generateLink is the token_hash for verifyOtp
    const { data: session, error: verifyError } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: linkData.properties.hashed_token,
    });

    if (verifyError || !session.session) {
      console.error('[token/auth] Error verifying OTP:', verifyError);
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Failed to create session' },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<AuthResponse>>({
      success: true,
      data: {
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
        expires_in: session.session.expires_in ?? 3600,
        token_type: 'bearer',
        user_id: userId,
      },
    });

  } catch (error) {
    console.error('[token/auth] Unexpected error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
