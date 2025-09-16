import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type AskSessionRecord } from "@/types";

const statusValues = ["active", "inactive", "draft", "closed"] as const;
const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  question: z.string().trim().min(5).max(2000).optional(),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(statusValues).optional(),
  challengeId: z.string().uuid().optional().or(z.literal("")),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
  isAnonymous: z.boolean().optional(),
  maxParticipants: z.number().int().positive().max(10000).optional()
});

function mapAsk(row: any): AskSessionRecord {
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
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "No valid fields provided"
      }, { status: 400 });
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from("ask_sessions")
      .update(updateData)
      .eq("id", askId)
      .select("*, projects(name)")
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
