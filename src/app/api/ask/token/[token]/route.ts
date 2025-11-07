import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { type ApiResponse } from "@/types";

type AskSessionRow = {
  ask_session_id: string;
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.trim().length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Token invalide'
      }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const isDevBypass = process.env.IS_DEV === 'true';

    // Use SECURITY DEFINER function to get ASK session data by token
    // This function verifies the token and returns data, bypassing RLS in a controlled way
    const { data: askRows, error: askError } = await supabase
      .rpc('get_ask_session_by_token', { p_token: token });

    if (askError) {
      console.error('Error getting ASK session by token:', askError);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour le token fourni'
      }, { status: 404 });
    }

    if (!askRows || askRows.length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour le token fourni'
      }, { status: 404 });
    }

    const askRow = askRows[0] as AskSessionRow;

    // Get participant info to check if they have an email
    const { data: participantInfoRows, error: participantInfoError } = await supabase
      .rpc('get_participant_by_token', { p_token: token });

    if (participantInfoError) {
      console.error('Error getting participant by token:', participantInfoError);
    }

    const participantInfo = participantInfoRows && participantInfoRows.length > 0 
      ? participantInfoRows[0] as { user_id: string | null; participant_email: string | null; participant_name: string | null; invite_token: string | null }
      : null;

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

    // Get participants using SECURITY DEFINER function
    const { data: participantRows, error: participantError } = await supabase
      .rpc('get_ask_participants_by_token', { p_token: token });

    if (participantError) {
      console.error('Error getting participants by token:', participantError);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Erreur lors de la récupération des participants'
      }, { status: 500 });
    }

    const participantUserIds = (participantRows ?? [])
      .map((row: any) => row.user_id)
      .filter((value: any): value is string => Boolean(value));

    // Get user profiles for participants (using normal client - profiles may have RLS)
    // If RLS blocks this, we'll just use participant_name from the participant data
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
        id: String(row.user_id ?? row.participant_id),
        name: displayName,
        email: row.participant_email || user.email || null,
        role: user.role || row.role || null,
        isSpokesperson: row.is_spokesperson === true,
        isActive: true,
      };
    });

    // Get project and challenge info using SECURITY DEFINER function
    const { data: contextRows, error: contextError } = await supabase
      .rpc('get_ask_context_by_token', { p_token: token });

    let project = null;
    let challenge = null;
    if (!contextError && contextRows && contextRows.length > 0) {
      const context = contextRows[0] as any;
      project = context.project_name ? { name: context.project_name } : null;
      challenge = context.challenge_name ? { name: context.challenge_name } : null;
    }

    // Get messages using SECURITY DEFINER function
    const { data: messageRows, error: messageError } = await supabase
      .rpc('get_ask_messages_by_token', { p_token: token });

    if (messageError) {
      console.error('Error getting messages by token:', messageError);
    }

    const messages = (messageRows ?? []).map((row: any) => ({
      id: row.message_id,
      askKey: askRow.ask_key,
      askSessionId: askRow.ask_session_id,
      content: row.content,
      type: row.type || 'text',
      senderType: row.sender_type || 'user',
      senderId: row.sender_id,
      senderName: row.sender_name,
      timestamp: row.created_at,
      metadata: row.metadata || {},
      clientId: row.message_id,
    }));

    // Get insights using SECURITY DEFINER function
    const { data: insightRows, error: insightError } = await supabase
      .rpc('get_ask_insights_by_token', { p_token: token });

    if (insightError) {
      console.error('Error getting insights by token:', insightError);
    }

    // Get insight authors separately (they may have RLS, but we'll try)
    const insightIds = (insightRows ?? []).map((row: any) => row.insight_id);
    let insightAuthorsById: Record<string, any[]> = {};
    if (insightIds.length > 0) {
      const { data: authors } = await supabase
        .from('insight_authors')
        .select('insight_id, user_id, display_name')
        .in('insight_id', insightIds);
      
      if (authors) {
        authors.forEach(author => {
          if (!insightAuthorsById[author.insight_id]) {
            insightAuthorsById[author.insight_id] = [];
          }
          insightAuthorsById[author.insight_id].push(author);
        });
      }
    }

    const insights = (insightRows ?? []).map((row: any) => ({
      id: row.insight_id,
      askId: askRow.ask_key,
      askSessionId: askRow.ask_session_id,
      challengeId: row.challenge_id,
      authorId: null,
      authorName: null,
      authors: (insightAuthorsById[row.insight_id] ?? []).map((author: any) => ({
        id: author.user_id || '',
        userId: author.user_id,
        name: author.display_name,
      })),
      content: row.content,
      summary: row.summary,
      type: (row.insight_type_name || 'pain') as any,
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
          id: askRow.ask_session_id,
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
          askSessionId: askRow.ask_session_id,
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

