import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type AskSessionRecord } from "@/types";

const statusValues = ["active", "inactive", "draft", "closed"] as const;
const deliveryModes = ["physical", "digital"] as const;
const audienceScopes = ["individual", "group"] as const;
const responseModes = ["collective", "simultaneous"] as const;
const askSelect = "*, projects(name), ask_participants(id, user_id, role, participant_name, participant_email, is_spokesperson, users(id, full_name, first_name, last_name, email, role))";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  question: z.string().trim().min(5).max(2000).optional(),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(statusValues).optional(),
  challengeId: z.string().uuid().optional().or(z.literal("")),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
  isAnonymous: z.boolean().optional(),
  maxParticipants: z.number().int().positive().max(10000).optional(),
  deliveryMode: z.enum(deliveryModes).optional(),
  audienceScope: z.enum(audienceScopes).optional(),
  responseMode: z.enum(responseModes).optional(),
  participantIds: z.array(z.string().uuid()).optional(),
  spokespersonId: z.string().uuid().optional().or(z.literal(""))
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const askId = z.string().uuid().parse(params.id);
    const body = await request.json();
    const payload = updateSchema.parse(body);

  const updateData: Record<string, any> = {};
  if (payload.name) updateData.name = sanitizeText(payload.name);
  if (payload.question) updateData.question = sanitizeText(payload.question);
  if (payload.description !== undefined) updateData.description = sanitizeOptional(payload.description);
  if (payload.status) updateData.status = payload.status;
  if (payload.challengeId !== undefined) {
      updateData.challenge_id = payload.challengeId && payload.challengeId !== "" ? payload.challengeId : null;
    }
    if (payload.startDate) {
      const startDate = new Date(payload.startDate);
      if (Number.isNaN(startDate.getTime())) {
        throw new z.ZodError([{ message: "Invalid start date", path: ["startDate"], code: "custom" }]);
      }
      updateData.start_date = startDate.toISOString();
    }
  if (payload.endDate) {
    const endDate = new Date(payload.endDate);
    if (Number.isNaN(endDate.getTime())) {
      throw new z.ZodError([{ message: "Invalid end date", path: ["endDate"], code: "custom" }]);
    }
    updateData.end_date = endDate.toISOString();
  }
  if (payload.isAnonymous !== undefined) updateData.is_anonymous = payload.isAnonymous;
  if (payload.maxParticipants !== undefined) updateData.max_participants = payload.maxParticipants;
  if (payload.deliveryMode) updateData.delivery_mode = payload.deliveryMode;
  if (payload.audienceScope) updateData.audience_scope = payload.audienceScope;
  if (payload.responseMode) updateData.response_mode = payload.responseMode;

  const hasParticipantUpdate = payload.participantIds !== undefined;
  const hasSpokespersonUpdate = payload.spokespersonId !== undefined;

  if (Object.keys(updateData).length === 0 && !hasParticipantUpdate && !hasSpokespersonUpdate) {
    return NextResponse.json<ApiResponse>({
      success: false,
      error: "No valid fields provided"
    }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();

  if (Object.keys(updateData).length > 0) {
    const { error } = await supabase
      .from("ask_sessions")
      .update(updateData)
      .eq("id", askId);

    if (error) {
      throw error;
    }
  }

  if (hasParticipantUpdate) {
    const participantIds = payload.participantIds ?? [];
    const { data: currentParticipants, error: currentError } = await supabase
      .from("ask_participants")
      .select("id, user_id")
      .eq("ask_session_id", askId);

    if (currentError) {
      throw currentError;
    }

    const currentIds = (currentParticipants ?? [])
      .map(entry => entry.user_id)
      .filter((value): value is string => Boolean(value));

    const toDeleteIds = (currentParticipants ?? [])
      .filter(entry => !participantIds.includes(entry.user_id))
      .map(entry => entry.id);

    if (toDeleteIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("ask_participants")
        .delete()
        .in("id", toDeleteIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    const toInsertIds = participantIds.filter(id => !currentIds.includes(id));
    const spokespersonId = payload.spokespersonId && payload.spokespersonId !== "" ? payload.spokespersonId : null;

    if (toInsertIds.length > 0) {
      const insertPayload = toInsertIds.map(userId => ({
        ask_session_id: askId,
        user_id: userId,
        role: spokespersonId && userId === spokespersonId ? "spokesperson" : "participant",
      }));

      const { error: insertError } = await supabase
        .from("ask_participants")
        .insert(insertPayload);

      if (insertError) {
        throw insertError;
      }
    }

    // Ensure role alignment for existing participants
    const { error: resetError } = await supabase
      .from("ask_participants")
      .update({ role: "participant" })
      .eq("ask_session_id", askId);

    if (resetError) {
      throw resetError;
    }

    if (spokespersonId) {
      const { error: setSpokesError } = await supabase
        .from("ask_participants")
        .update({ role: "spokesperson" })
        .eq("ask_session_id", askId)
        .eq("user_id", spokespersonId);

      if (setSpokesError) {
        throw setSpokesError;
      }
    }
  } else if (hasSpokespersonUpdate) {
    const spokespersonId = payload.spokespersonId && payload.spokespersonId !== "" ? payload.spokespersonId : null;

    const { error: resetError } = await supabase
      .from("ask_participants")
      .update({ role: "participant" })
      .eq("ask_session_id", askId);

    if (resetError) {
      throw resetError;
    }

    if (spokespersonId) {
      const { error: setSpokesError } = await supabase
        .from("ask_participants")
        .update({ role: "spokesperson" })
        .eq("ask_session_id", askId)
        .eq("user_id", spokespersonId);

      if (setSpokesError) {
        throw setSpokesError;
      }
    }
  }

  const { data, error } = await supabase
    .from("ask_sessions")
    .select(askSelect)
    .eq("id", askId)
    .single();

  if (error) {
    throw error;
  }

  return NextResponse.json<ApiResponse<AskSessionRecord>>({
    success: true,
    data: mapAsk(data)
  });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const askId = z.string().uuid().parse(params.id);

    const supabase = getAdminSupabaseClient();
    const { error } = await supabase.from("ask_sessions").delete().eq("id", askId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse>({ success: true });
  } catch (error) {
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid ASK id" : parseErrorMessage(error)
    }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
