import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { parseErrorMessage } from "@/lib/utils";
import { sendMagicLink } from "@/lib/auth/magicLink";
import { type ApiResponse } from "@/types";

const askSelect = "*, projects(name), ask_participants(id, user_id, role, participant_name, participant_email, is_spokesperson, invite_token)";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    
    const askId = z.string().uuid().parse(params.id);

    // Get the ask session with participants
    const { data: ask, error: askError } = await supabase
      .from("ask_sessions")
      .select(askSelect)
      .eq("id", askId)
      .single();

    if (askError || !ask) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Ask session not found"
      }, { status: 404 });
    }

    const sentEmails: string[] = [];
    const failedEmails: Array<{ email: string; error: string }> = [];

    // Get participant emails - fetch profiles for user_id participants
    type Participant = {
      id: string;
      user_id: string | null;
      role: string | null;
      participant_name: string | null;
      participant_email: string | null;
      is_spokesperson: boolean | null;
      invite_token: string | null;
    };
    
    const userIds = (ask.ask_participants as Participant[] | null | undefined)
      ?.filter((p: Participant) => p.user_id)
      .map((p: Participant) => p.user_id)
      .filter((id): id is string => Boolean(id)) || [];

    let profileEmails = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);

      if (profiles) {
        profiles.forEach(profile => {
          if (profile.email) {
            profileEmails.set(profile.id, profile.email);
          }
        });
      }
    }

    // Send magic links to all participants
    const participants = ask.ask_participants as Participant[] | null | undefined;
    if (participants && participants.length > 0) {
      for (const participant of participants) {
        let email: string | null = null;

        // Get email from participant_email or from profile
        if (participant.participant_email) {
          email = participant.participant_email;
        } else if (participant.user_id) {
          email = profileEmails.get(participant.user_id) || null;
        }

        if (email) {
          // Use participant token if available, otherwise fall back to askKey
          const participantToken = participant.invite_token || undefined;
          const result = await sendMagicLink(email, ask.ask_key, ask.project_id, participantToken);
          if (result.success) {
            sentEmails.push(email);
          } else {
            failedEmails.push({ email, error: result.error || "Unknown error" });
          }
        }
      }
    }

    return NextResponse.json<ApiResponse<{
      sent: number;
      failed: number;
      sentEmails: string[];
      failedEmails: Array<{ email: string; error: string }>;
    }>>({
      success: true,
      data: {
        sent: sentEmails.length,
        failed: failedEmails.length,
        sentEmails,
        failedEmails,
      }
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}

