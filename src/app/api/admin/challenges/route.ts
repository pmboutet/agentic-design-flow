import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ChallengeRecord } from "@/types";

const statusValues = ["open", "in_progress", "active", "closed", "archived"] as const;
const priorityValues = ["low", "medium", "high", "critical"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(statusValues).default("open"),
  priority: z.enum(priorityValues).default("medium"),
  projectId: z.string().uuid(),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  assignedTo: z.string().uuid().optional().or(z.literal("")),
  parentChallengeId: z.string().uuid().optional().or(z.literal("")),
  systemPrompt: z.string().trim().max(8000).optional().or(z.literal("")),
  dueDate: z.string().trim().min(1).optional(),
});

function mapChallenge(row: any): ChallengeRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    projectId: row.project_id,
    projectName: row.projects?.name ?? null,
    parentChallengeId: row.parent_challenge_id ?? null,
    assignedTo: row.assigned_to,
    dueDate: row.due_date,
    updatedAt: row.updated_at,
    systemPrompt: row.system_prompt ?? null
  };
}

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from("challenges")
      .select("*, projects(name)")
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ChallengeRecord[]>>({
      success: true,
      data: (data ?? []).map(mapChallenge)
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
    const payload = createSchema.parse(body);

    const insertData: Record<string, any> = {
      name: sanitizeText(payload.name),
      status: payload.status,
      priority: payload.priority,
      project_id: payload.projectId,
    };

    if (payload.description !== undefined) {
      insertData.description = sanitizeOptional(payload.description || null);
    }
    if (payload.category !== undefined) {
      insertData.category = sanitizeOptional(payload.category || null);
    }
    if (payload.systemPrompt !== undefined) {
      insertData.system_prompt = sanitizeOptional(payload.systemPrompt || null);
    }
    if (payload.assignedTo !== undefined) {
      insertData.assigned_to = payload.assignedTo && payload.assignedTo !== "" ? payload.assignedTo : null;
    }
    if (payload.parentChallengeId !== undefined) {
      insertData.parent_challenge_id =
        payload.parentChallengeId && payload.parentChallengeId !== "" ? payload.parentChallengeId : null;
    }
    if (payload.dueDate) {
      const dueDate = new Date(payload.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        throw new z.ZodError([{ message: "Invalid due date", path: ["dueDate"], code: "custom" }]);
      }
      insertData.due_date = dueDate.toISOString();
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from("challenges")
      .insert(insertData)
      .select("*, projects(name)")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ChallengeRecord>>({
      success: true,
      data: mapChallenge(data),
    }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error),
    }, { status });
  }
}
