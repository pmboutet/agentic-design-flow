import { NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";

/**
 * Debug endpoint to check all participant tokens in the database
 * GET /api/debug/check-tokens?ask_id=<uuid>
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const askId = searchParams.get("ask_id");

    const admin = getAdminSupabaseClient();

    if (askId) {
      // Check tokens for specific ASK
      const { data, error } = await admin
        .from("ask_participants")
        .select("id, user_id, participant_name, participant_email, invite_token, ask_session_id")
        .eq("ask_session_id", askId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        askId,
        participants: data?.map(p => ({
          id: p.id,
          userId: p.user_id,
          name: p.participant_name,
          email: p.participant_email,
          hasToken: !!p.invite_token,
          tokenPreview: p.invite_token?.substring(0, 8) || null,
          fullToken: p.invite_token, // For debugging only - remove in production!
        })),
      });
    }

    // Check all participants without tokens
    const { data, error } = await admin
      .from("ask_participants")
      .select("id, user_id, participant_name, participant_email, invite_token, ask_session_id")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const withoutTokens = data?.filter(p => !p.invite_token) || [];
    const withTokens = data?.filter(p => p.invite_token) || [];

    return NextResponse.json({
      total: data?.length || 0,
      withTokens: withTokens.length,
      withoutTokens: withoutTokens.length,
      participants: data?.map(p => ({
        id: p.id,
        userId: p.user_id,
        askSessionId: p.ask_session_id,
        name: p.participant_name,
        email: p.participant_email,
        hasToken: !!p.invite_token,
        tokenPreview: p.invite_token?.substring(0, 8) || null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
