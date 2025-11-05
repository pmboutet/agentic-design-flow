import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type AskSessionRecord } from "@/types";
import { ensureProfileExists } from "@/lib/profiles";
import { sendMagicLink } from "@/lib/auth/magicLink";

const statusValues = ["active", "inactive", "draft", "closed"] as const;
const deliveryModes = ["physical", "digital"] as const;
const audienceScopes = ["individual", "group"] as const;
const responseModes = ["collective", "simultaneous"] as const;
const askSelect = "*, projects(name), ask_participants(id, user_id, role, participant_name, participant_email, is_spokesperson)";
const dateSchema = z.string().trim().min(1).refine(value => !Number.isNaN(new Date(value).getTime()), {
  message: "Invalid date"
});

const askSchema = z.object({
  askKey: z.string().trim().min(3).max(255).regex(/^[a-zA-Z0-9._-]+$/),
  name: z.string().trim().min(1).max(255),
  question: z.string().trim().min(5).max(2000),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(statusValues).default("active"),
  projectId: z.string().uuid(),
  challengeId: z.string().uuid().optional().or(z.literal("")),
  startDate: dateSchema,
  endDate: dateSchema,
  isAnonymous: z.boolean().default(false),
  maxParticipants: z.number().int().positive().max(10000).optional(),
  deliveryMode: z.enum(deliveryModes),
  audienceScope: z.enum(audienceScopes),
  responseMode: z.enum(responseModes),
  participantIds: z.array(z.string().uuid()).default([]),
  participantEmails: z.array(z.string().email()).default([]),
  spokespersonId: z.string().uuid().optional().or(z.literal("")),
  spokespersonEmail: z.string().email().optional().or(z.literal(""))
});

function mapAsk(row: any): AskSessionRecord {
  const participants = (row.ask_participants ?? []).map((participant: any) => {
    const user = participant.users ?? {};
    const nameFromUser = [user.first_name, user.last_name].filter(Boolean).join(" ");
    const displayName = participant.participant_name || user.full_name || nameFromUser || participant.participant_email || "Participant";

    return {
      id: String(participant.user_id ?? participant.id),
      name: displayName,
      email: participant.participant_email || user.email || null,
      role: user.role || participant.role || null,
      isSpokesperson: participant.role === "spokesperson" || participant.is_spokesperson === true,
      isActive: true,
    };
  });

  return {
    id: row.id,
    askKey: row.ask_key,
    name: row.name,
    question: row.question,
    description: row.description,
    status: row.status,
    projectId: row.project_id,
    projectName: row.projects?.name ?? null,
    challengeId: row.challenge_id,
    startDate: row.start_date,
    endDate: row.end_date,
    isAnonymous: row.is_anonymous,
    maxParticipants: row.max_participants,
    deliveryMode: row.delivery_mode ?? "digital",
    audienceScope: row.audience_scope ?? "individual",
    responseMode: row.response_mode ?? "collective",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participants,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Verify user is admin and get authenticated client
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    
    const url = new URL(request.url);
    const challengeId = url.searchParams.get("challengeId");

    let query = supabase
      .from("ask_sessions")
      .select(askSelect)
      .order("created_at", { ascending: false });

    if (challengeId) {
      if (!z.string().uuid().safeParse(challengeId).success) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Invalid challenge identifier"
        }, { status: 400 });
      }
      query = query.eq("challenge_id", challengeId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<AskSessionRecord[]>>({
      success: true,
      data: (data ?? []).map(mapAsk)
    });
  } catch (error) {
    const status = error instanceof Error && error.message.includes('required') ? 403 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is admin and get authenticated client
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    
    const body = await request.json();
    console.log('🔧 ASK creation request:', body);
    
    const payload = askSchema.parse(body);
    console.log('✅ Parsed ASK payload:', payload);
    const startDate = new Date(payload.startDate).toISOString();
    const endDate = new Date(payload.endDate).toISOString();

    const insertData = {
      ask_key: sanitizeText(payload.askKey),
      name: sanitizeText(payload.name),
      question: sanitizeText(payload.question),
      description: sanitizeOptional(payload.description || null),
      status: payload.status,
      project_id: payload.projectId,
      challenge_id: payload.challengeId && payload.challengeId !== "" ? payload.challengeId : null,
      start_date: startDate,
      end_date: endDate,
      is_anonymous: payload.isAnonymous,
      max_participants: payload.maxParticipants ?? null,
      delivery_mode: payload.deliveryMode,
      audience_scope: payload.audienceScope,
      response_mode: payload.responseMode
    };

    console.log('📝 ASK insert data to be sent to DB:', insertData);

    const { data, error } = await supabase
      .from("ask_sessions")
      .insert(insertData)
      .select(askSelect)
      .single();

    if (error) {
      console.error('❌ ASK creation database error:', error);
      throw error;
    }

    console.log('✅ ASK created successfully:', data);

    // Process participants from user IDs
    const participantRecords: Array<{
      ask_session_id: string;
      user_id?: string;
      participant_email?: string;
      role: string;
    }> = [];

    // Determine spokesperson ID/email
    const spokespersonId = payload.spokespersonId && payload.spokespersonId !== "" ? payload.spokespersonId : null;
    const spokespersonEmail = payload.spokespersonEmail && payload.spokespersonEmail !== "" ? payload.spokespersonEmail.toLowerCase().trim() : null;

    // Add participants from user IDs
    if (payload.participantIds.length > 0) {
      for (const userId of payload.participantIds) {
        participantRecords.push({
          ask_session_id: data.id,
          user_id: userId,
          role: spokespersonId && userId === spokespersonId ? "spokesperson" : "participant",
        });
      }
    }

    // Process participants from email addresses
    const emailParticipants: Array<{ email: string; profileId?: string }> = [];
    
    if (payload.participantEmails.length > 0) {
      for (const email of payload.participantEmails) {
        const normalizedEmail = email.toLowerCase().trim();
        
        try {
          // Ensure profile exists and is added to project
          const profileId = await ensureProfileExists(normalizedEmail, payload.projectId);
          
          // Check if profile already added (from participantIds)
          const alreadyAdded = participantRecords.some(p => p.user_id === profileId);
          
          if (!alreadyAdded) {
            participantRecords.push({
              ask_session_id: data.id,
              user_id: profileId,
              participant_email: normalizedEmail,
              role: spokespersonEmail && normalizedEmail === spokespersonEmail ? "spokesperson" : "participant",
            });
            
            emailParticipants.push({ email: normalizedEmail, profileId });
          }
        } catch (error) {
          console.error(`Failed to create profile for ${normalizedEmail}:`, error);
          // Continue with other emails even if one fails
          // Still add as email-only participant
          participantRecords.push({
            ask_session_id: data.id,
            participant_email: normalizedEmail,
            role: spokespersonEmail && normalizedEmail === spokespersonEmail ? "spokesperson" : "participant",
          });
          emailParticipants.push({ email: normalizedEmail });
        }
      }
    }

    // Insert all participants
    if (participantRecords.length > 0) {
      const { error: participantError } = await supabase
        .from("ask_participants")
        .insert(participantRecords);

      if (participantError) {
        throw participantError;
      }
    }

    const { data: hydrated, error: fetchError } = await supabase
      .from("ask_sessions")
      .select(askSelect)
      .eq("id", data.id)
      .single();

    const record = fetchError ? data : hydrated;

    return NextResponse.json<ApiResponse<AskSessionRecord>>({
      success: true,
      data: mapAsk(record)
    }, { status: 201 });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    else if (error instanceof Error && error.message.includes('required')) status = 403;
    
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}
