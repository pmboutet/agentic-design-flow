import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/supabaseServer';
import { canManageAskParticipants } from '@/lib/memberPermissions';
import { parseErrorMessage } from '@/lib/utils';
import { type ApiResponse } from '@/types';
import { buildParticipantDisplayName, type ParticipantRow, type UserRow } from '@/lib/conversation-context';

interface AskParticipant {
  id: string;
  userId: string | null;
  participantName: string;
  participantEmail: string | null;
  role: string | null;
  isSpokesperson: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify user is admin
    const { profile } = await requireAdmin();

    const { id } = await params;
    const askId = z.string().uuid("Invalid ASK session id").parse(id);

    // Check if user can view participants of this ASK
    const permission = await canManageAskParticipants(profile, askId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    const supabase = getAdminSupabaseClient();

    // Fetch participants for this ASK session
    const { data: participants, error } = await supabase
      .from('ask_participants')
      .select('id, user_id, participant_name, participant_email, role, is_spokesperson, joined_at')
      .eq('ask_session_id', askId)
      .order('joined_at', { ascending: true });

    if (error) {
      throw error;
    }

    // Fetch user info for participants with user_id
    const participantsWithUserInfo: AskParticipant[] = await Promise.all(
      (participants || []).map(async (participant, index) => {
        let user: UserRow | null = null;
        if (participant.user_id) {
          const { data } = await supabase
            .from('profiles')
            .select('id, email, full_name, first_name, last_name')
            .eq('id', participant.user_id)
            .maybeSingle();
          user = data as UserRow | null;
        }

        // Use centralized function for display name
        const displayName = buildParticipantDisplayName(
          participant as ParticipantRow,
          user,
          index
        );

        return {
          id: participant.id,
          userId: participant.user_id,
          participantName: displayName,
          participantEmail: participant.participant_email || user?.email || null,
          role: participant.role,
          isSpokesperson: participant.is_spokesperson,
        };
      })
    );

    return NextResponse.json<ApiResponse<AskParticipant[]>>({
      success: true,
      data: participantsWithUserInfo,
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) {
      status = 400;
    } else if (error instanceof Error && error.message.includes("required")) {
      status = 403;
    }
    console.error('Error fetching ASK participants:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError
        ? error.errors[0]?.message || "Invalid parameters"
        : parseErrorMessage(error),
    }, { status });
  }
}
