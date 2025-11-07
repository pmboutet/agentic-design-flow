import { NextRequest, NextResponse } from "next/server";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
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

type TokenDataBundle = {
  askRow: AskSessionRow;
  participantInfo: {
    user_id: string | null;
    participant_email: string | null;
    participant_name: string | null;
    invite_token: string | null;
  } | null;
  participants: Array<{
    participant_id: string;
    user_id: string | null;
    participant_name: string | null;
    participant_email: string | null;
    role: string | null;
    is_spokesperson: boolean | null;
    joined_at: string | null;
  }>;
  contextRows: Array<{ project_name: string | null; challenge_name: string | null }>;
  messages: Array<{
    message_id: string;
    content: string;
    type: string;
    sender_type: string;
    sender_id: string | null;
    sender_name: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }>;
  insights: Array<{
    insight_id: string;
    content: string;
    summary: string | null;
    challenge_id: string | null;
    status: string | null;
    insight_type_name: string | null;
    created_at: string;
    updated_at: string;
  }>;
  profileClient: SupabaseClient;
};

async function loadTokenDataWithAdmin(token: string): Promise<TokenDataBundle | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  try {
    const admin = getAdminSupabaseClient();
    const { data: participantInfoRow, error: participantFetchError } = await admin
      .from("ask_participants")
      .select("id, user_id, participant_name, participant_email, role, is_spokesperson, invite_token, ask_session_id, joined_at")
      .eq("invite_token", token)
      .maybeSingle();

    if (participantFetchError || !participantInfoRow) {
      console.error("Fallback loader: participant not found for token", participantFetchError);
      return null;
    }

    const askSessionId = participantInfoRow.ask_session_id;

    const { data: askRow, error: askError } = await admin
      .from("ask_sessions")
      .select(
        "ask_session_id:id, ask_key, name, question, description, status, start_date, end_date, is_anonymous, max_participants, delivery_mode, audience_scope, response_mode, project_id, challenge_id, created_by, created_at, updated_at",
      )
      .eq("id", askSessionId)
      .maybeSingle<AskSessionRow>();

    if (askError || !askRow) {
      console.error("Fallback loader: ask session not found for token", askError);
      return null;
    }

    const [participantsResult, messagesResult, insightsResult, projectResult, challengeResult] = await Promise.all([
      admin
        .from("ask_participants")
        .select("id, user_id, participant_name, participant_email, role, is_spokesperson, joined_at")
        .eq("ask_session_id", askRow.ask_session_id)
        .order("joined_at", { ascending: true }),
      admin
        .from("messages")
        .select("id, content, type, sender_type, sender_id, sender_name, created_at, metadata")
        .eq("ask_session_id", askRow.ask_session_id)
        .order("created_at", { ascending: true }),
      admin
        .from("insights")
        .select("id, ask_session_id, challenge_id, content, summary, status, insight_type_id, created_at, updated_at, insight_types(name)")
        .eq("ask_session_id", askRow.ask_session_id),
      askRow.project_id
        ? admin.from("projects").select("id, name").eq("id", askRow.project_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      askRow.challenge_id
        ? admin.from("challenges").select("id, name").eq("id", askRow.challenge_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (participantsResult.error) {
      throw participantsResult.error;
    }
    if (messagesResult.error) {
      throw messagesResult.error;
    }
    if (insightsResult.error) {
      throw insightsResult.error;
    }

    const contextRows = [
      {
        project_name: projectResult.data?.name ?? null,
        challenge_name: challengeResult.data?.name ?? null,
      },
    ];

    return {
      askRow,
      participantInfo: {
        user_id: participantInfoRow.user_id,
        participant_email: participantInfoRow.participant_email,
        participant_name: participantInfoRow.participant_name,
        invite_token: participantInfoRow.invite_token,
      },
      participants:
        (participantsResult.data ?? []).map(row => ({
          participant_id: row.id,
          user_id: row.user_id,
          participant_name: row.participant_name,
          participant_email: row.participant_email,
          role: row.role,
          is_spokesperson: row.is_spokesperson,
          joined_at: row.joined_at,
        })) ?? [],
      contextRows,
      messages:
        (messagesResult.data ?? []).map(row => ({
          message_id: row.id,
          content: row.content,
          type: row.type,
          sender_type: row.sender_type,
          sender_id: row.sender_id,
          sender_name: row.sender_name,
          created_at: row.created_at,
          metadata: row.metadata ?? null,
        })) ?? [],
      insights:
        (insightsResult.data ?? []).map(row => ({
          insight_id: row.id,
          content: row.content,
          summary: row.summary,
          challenge_id: row.challenge_id,
          status: row.status,
          insight_type_name: row.insight_types?.name ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })) ?? [],
      profileClient: admin,
    };
  } catch (error) {
    console.error("Fallback loader: unexpected error", error);
    return null;
  }
}

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

    let askRow: AskSessionRow | null = null;
    let participantInfo: TokenDataBundle["participantInfo"] = null;
    let participantRows: TokenDataBundle["participants"] = [];
    let contextRows: TokenDataBundle["contextRows"] = [];
    let messageRows: TokenDataBundle["messages"] = [];
    let insightRows: TokenDataBundle["insights"] = [];
    let profileClient: SupabaseClient = supabase;

    // Attempt to fetch via RPC (preferred). Fallback to admin client if RPC unavailable or empty.
    const { data: askRows, error: askError } = await supabase
      .rpc('get_ask_session_by_token', { p_token: token });

    if (askError || !askRows || askRows.length === 0) {
      console.warn('RPC get_ask_session_by_token failed, attempting fallback...', askError);
      const fallbackData = await loadTokenDataWithAdmin(token);
      if (!fallbackData) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'ASK introuvable pour le token fourni'
        }, { status: 404 });
      }
      askRow = fallbackData.askRow;
      participantInfo = fallbackData.participantInfo;
      participantRows = fallbackData.participants;
      contextRows = fallbackData.contextRows;
      messageRows = fallbackData.messages;
      insightRows = fallbackData.insights;
      profileClient = fallbackData.profileClient;
    } else {
      askRow = askRows[0] as AskSessionRow;

      const [
        { data: participantInfoRows, error: participantInfoError },
        { data: participantRowsData, error: participantError },
        { data: contextRowsData, error: contextError },
        { data: messageRowsData, error: messageError },
        { data: insightRowsData, error: insightError },
      ] = await Promise.all([
        supabase.rpc('get_participant_by_token', { p_token: token }),
        supabase.rpc('get_ask_participants_by_token', { p_token: token }),
        supabase.rpc('get_ask_context_by_token', { p_token: token }),
        supabase.rpc('get_ask_messages_by_token', { p_token: token }),
        supabase.rpc('get_ask_insights_by_token', { p_token: token }),
      ]);

      if (participantInfoError) {
        console.error('Error getting participant by token:', participantInfoError);
      }
      participantInfo = participantInfoRows && participantInfoRows.length > 0
        ? participantInfoRows[0] as { user_id: string | null; participant_email: string | null; participant_name: string | null; invite_token: string | null }
        : null;

      if (participantError) {
        console.error('Error getting participants by token:', participantError);
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Erreur lors de la récupération des participants'
        }, { status: 500 });
      }
      participantRows = (participantRowsData ?? []) as TokenDataBundle["participants"];

      if (contextError) {
        console.error('Error getting context by token:', contextError);
      } else {
        contextRows = contextRowsData as TokenDataBundle["contextRows"];
      }

      if (messageError) {
        console.error('Error getting messages by token:', messageError);
      } else {
        messageRows = (messageRowsData ?? []) as TokenDataBundle["messages"];
      }

      if (insightError) {
        console.error('Error getting insights by token:', insightError);
      } else {
        insightRows = (insightRowsData ?? []) as TokenDataBundle["insights"];
      }
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

    const participantUserIds = (participantRows ?? [])
      .map((row: any) => row.user_id)
      .filter((value: any): value is string => Boolean(value));

    // Get user profiles for participants (using normal client - profiles may have RLS)
    // If RLS blocks this, we'll just use participant_name from the participant data
    let usersById: Record<string, any> = {};
    if (participantUserIds.length > 0) {
      const { data: users } = await profileClient
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

    let project = null;
    let challenge = null;
    if (contextRows && contextRows.length > 0) {
      const context = contextRows[0] as any;
      project = context.project_name ? { name: context.project_name } : null;
      challenge = context.challenge_name ? { name: context.challenge_name } : null;
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

    // Get insight authors separately (they may have RLS, but we'll try)
    const insightIds = (insightRows ?? []).map((row: any) => row.insight_id);
    let insightAuthorsById: Record<string, any[]> = {};
    if (insightIds.length > 0) {
      const { data: authors } = await profileClient
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
