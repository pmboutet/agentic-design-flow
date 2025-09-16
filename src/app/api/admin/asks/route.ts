import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type AskSessionRecord } from "@/types";

const statusValues = ["active", "inactive", "draft", "closed"] as const;
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

export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminSupabaseClient();
    const url = new URL(request.url);
    const challengeId = url.searchParams.get("challengeId");

    let query = supabase
      .from("ask_sessions")
      .select("*, projects(name)")
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
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = askSchema.parse(body);

    const supabase = getAdminSupabaseClient();
    const startDate = new Date(payload.startDate).toISOString();
    const endDate = new Date(payload.endDate).toISOString();

    const { data, error } = await supabase
      .from("ask_sessions")
      .insert({
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
        max_participants: payload.maxParticipants ?? null
      })
      .select("*, projects(name)")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<AskSessionRecord>>({
      success: true,
      data: mapAsk(data)
    }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}
