import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getAskSessionByToken } from "@/lib/asks";
import { type ApiResponse } from "@/types";
import type { PostgrestError } from "@supabase/supabase-js";
import { isPermissionDenied } from "@/lib/utils";

type AskSessionRow = {
  id: string;
  ask_key: string;
  name: string;
  question: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string;
  is_anonymous: boolean;
  max_participants: number | null;
  delivery_mode: string;
  audience_scope: string;
  response_mode: string;
  project_id: string;
  challenge_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function permissionDeniedResponse(): NextResponse<ApiResponse> {
  return NextResponse.json<ApiResponse>({
    success: false,
    error: "Accès non autorisé à cette ASK"
  }, { status: 403 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    if (!token || token.trim().length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Token invalide'
      }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const isDevBypass = process.env.IS_DEV === 'true';

    // First, verify the token and get the ASK session
    // This allows access even without authentication if token is valid
    const { row: askRow, participantId, error: askError } = await getAskSessionByToken<AskSessionRow>(
      supabase,
      token,
      '*'
    );

    if (askError) {
      if (isPermissionDenied(askError)) {
        return permissionDeniedResponse();
      }
      throw askError;
    }

    if (!askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour le token fourni'
      }, { status: 404 });
    }

    // Get participant info to check if they have an email
    let participantInfo: { user_id: string | null; participant_email: string | null; participant_name: string | null } | null = null;
    if (participantId) {
      const { data: participantData, error: participantError } = await supabase
        .from('ask_participants')
        .select('user_id, participant_email, participant_name, invite_token')
        .eq('id', participantId)
        .eq('invite_token', token)
        .maybeSingle();

      if (participantError && !isPermissionDenied(participantError)) {
        throw participantError;
      }

      participantInfo = participantData;
    }

    // Try to get authenticated user (optional - token access doesn't require auth)
    let profileId: string | null = null;
    let isAuthenticated = false;

    if (!isDevBypass) {
      const { data: userResult, error: userError } = await supabase.auth.getUser();

      if (!userError && userResult?.user) {
        isAuthenticated = true;
        
        // Get profile ID from auth_id
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_id', userResult.user.id)
          .single();

        if (!profileError && profile) {
          profileId = profile.id;

          // If participant has a user_id, verify it matches the current user
          if (participantInfo?.user_id && participantInfo.user_id !== profileId) {
            return NextResponse.json<ApiResponse>({
              success: false,
              error: 'Ce lien est associé à un autre participant'
            }, { status: 403 });
          }
        }
      }
    } else {
      isAuthenticated = true; // Dev bypass
    }

    // Token is valid - allow access to view the ASK
    // The token itself is proof of authorization
    // Authentication is optional but recommended for full participation
    // If participant has user_id but user is not authenticated, we still allow access
    // but the frontend can prompt for authentication if needed

    // Get participants
    const { data: participantRows, error: participantError } = await supabase
      .from('ask_participants')
      .select('*')
      .eq('ask_session_id', askRow.id)
      .order('joined_at', { ascending: true });

    if (participantError) {
      if (isPermissionDenied(participantError)) {
        return permissionDeniedResponse();
      }
      throw participantError;
    }

    const participantUserIds = (participantRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    let usersById: Record<string, any> = {};
    if (participantUserIds.length > 0) {
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, role, job_title')
        .in('id', participantUserIds);

      if (users) {
        users.forEach(user => {
          usersById[user.id] = user;
        });
      }
    }

    const participants = (participantRows ?? []).map((row: any) => {
      const user = usersById[row.user_id] ?? {};
      const nameFromUser = [user.first_name, user.last_name].filter(Boolean).join(" ");
      const displayName = row.participant_name || user.full_name || nameFromUser || row.participant_email || "Participant";

      return {
        id: String(row.user_id ?? row.id),
        name: displayName,
        email: row.participant_email || user.email || null,
        role: user.role || row.role || null,
        isSpokesperson: row.role === "spokesperson" || row.is_spokesperson === true,
        isActive: true,
      };
    });

    // Get project info
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', askRow.project_id)
      .maybeSingle();

    // Get challenge info if exists
    let challenge = null;
    if (askRow.challenge_id) {
      const { data: challengeData } = await supabase
        .from('challenges')
        .select('name')
        .eq('id', askRow.challenge_id)
        .maybeSingle();
      challenge = challengeData;
    }

    // Get messages for this session
    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('ask_session_id', askRow.id)
      .order('created_at', { ascending: true });

    if (messageError && !isPermissionDenied(messageError)) {
      throw messageError;
    }

    const messages = (messageRows ?? []).map((row: any) => ({
      id: row.id,
      askKey: askRow.ask_key,
      askSessionId: row.ask_session_id,
      content: row.content,
      type: row.type || 'text',
      senderType: row.sender_type || 'user',
      senderId: row.sender_id,
      senderName: row.sender_name,
      timestamp: row.created_at || row.timestamp,
      metadata: row.metadata || {},
      clientId: row.id,
    }));

    // Get insights
    const { data: insightRows, error: insightError } = await supabase
      .from('insights')
      .select(`
        id,
        ask_session_id,
        content,
        summary,
        status,
        created_at,
        updated_at,
        insight_types(name),
        challenge_id,
        insight_authors(user_id, name)
      `)
      .eq('ask_session_id', askRow.id)
      .order('created_at', { ascending: false });

    if (insightError && !isPermissionDenied(insightError)) {
      throw insightError;
    }

    const insights = (insightRows ?? []).map((row: any) => ({
      id: row.id,
      askId: askRow.ask_key,
      askSessionId: row.ask_session_id,
      challengeId: row.challenge_id,
      authorId: null,
      authorName: null,
      authors: (row.insight_authors ?? []).map((author: any) => ({
        id: author.user_id || '',
        userId: author.user_id,
        name: author.name,
      })),
      content: row.content,
      summary: row.summary,
      type: (row.insight_types?.name || 'pain') as any,
      category: null,
      status: row.status || 'new',
      priority: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      relatedChallengeIds: row.challenge_id ? [row.challenge_id] : [],
      kpis: [],
      sourceMessageId: null,
    }));

    // Get challenges if any
    const challenges: any[] = [];

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        ask: {
          id: askRow.id,
          key: askRow.ask_key,
          name: askRow.name,
          question: askRow.question,
          description: askRow.description,
          status: askRow.status,
          isActive: askRow.status === 'active',
          startDate: askRow.start_date,
          endDate: askRow.end_date,
          createdAt: askRow.created_at,
          updatedAt: askRow.updated_at,
          deliveryMode: askRow.delivery_mode as "physical" | "digital",
          audienceScope: askRow.audience_scope as "individual" | "group",
          responseMode: askRow.response_mode as "collective" | "simultaneous",
          participants,
          askSessionId: askRow.id,
        },
        messages,
        insights,
        challenges,
      }
    });
  } catch (error) {
    console.error('Error in GET /api/ask/token/[token]:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : "Une erreur est survenue"
    }, { status: 500 });
  }
}

