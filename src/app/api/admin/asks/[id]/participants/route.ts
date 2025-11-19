import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getAdminSupabaseClient();

    // Fetch participants for this ASK session
    const { data: participants, error } = await supabase
      .from('ask_participants')
      .select('id, user_id, participant_name, participant_email, role, is_spokesperson, joined_at')
      .eq('ask_session_id', id)
      .order('joined_at', { ascending: true });

    if (error) {
      throw error;
    }

    // Fetch user info for participants with user_id
    const participantsWithUserInfo = await Promise.all(
      (participants || []).map(async (participant) => {
        if (participant.user_id) {
          const { data: user } = await supabase
            .from('profiles')
            .select('id, email, full_name, first_name, last_name')
            .eq('id', participant.user_id)
            .maybeSingle();

          if (user) {
            // Build display name
            let displayName = participant.participant_name;
            if (!displayName) {
              if (user.full_name) {
                displayName = user.full_name;
              } else {
                const nameParts = [user.first_name, user.last_name].filter(Boolean);
                displayName = nameParts.length > 0 ? nameParts.join(' ') : user.email || 'Participant';
              }
            }

            return {
              id: participant.id,
              userId: participant.user_id,
              participantName: displayName,
              participantEmail: participant.participant_email || user.email,
              role: participant.role,
              isSpokesperson: participant.is_spokesperson,
            };
          }
        }

        return {
          id: participant.id,
          userId: participant.user_id,
          participantName: participant.participant_name || 'Participant',
          participantEmail: participant.participant_email,
          role: participant.role,
          isSpokesperson: participant.is_spokesperson,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: participantsWithUserInfo,
    });
  } catch (error) {
    console.error('Error fetching ASK participants:', error);
    return NextResponse.json({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}


