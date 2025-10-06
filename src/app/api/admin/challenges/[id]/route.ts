import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ChallengeRecord } from "@/types";

const statusValues = ["open", "in_progress", "active", "closed", "archived"] as const;
const priorityValues = ["low", "medium", "high", "critical"] as const;

const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(statusValues).optional(),
  priority: z.enum(priorityValues).optional(),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  assignedTo: z.string().uuid().optional().or(z.literal("")),
  dueDate: z.string().trim().min(1).optional(),
  parentChallengeId: z.string().uuid().optional().or(z.literal("")),
  systemPrompt: z.string().trim().max(8000).optional().or(z.literal(""))
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const challengeId = z.string().uuid().parse(params.id);
    const body = await request.json();
    const payload = updateSchema.parse(body);

    const updateData: Record<string, any> = {};
    if (payload.name) updateData.name = sanitizeText(payload.name);
    if (payload.description !== undefined) updateData.description = sanitizeOptional(payload.description);
    if (payload.status) updateData.status = payload.status;
    if (payload.priority) updateData.priority = payload.priority;
    if (payload.category !== undefined) updateData.category = sanitizeOptional(payload.category);
    if (payload.assignedTo !== undefined) {
      updateData.assigned_to = payload.assignedTo && payload.assignedTo !== "" ? payload.assignedTo : null;
    }
    if (payload.parentChallengeId !== undefined) {
      updateData.parent_challenge_id =
        payload.parentChallengeId && payload.parentChallengeId !== "" ? payload.parentChallengeId : null;
    }
    if (payload.systemPrompt !== undefined) {
      updateData.system_prompt = sanitizeOptional(payload.systemPrompt || null);
    }
    if (payload.dueDate) {
      const dueDate = new Date(payload.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        throw new z.ZodError([{ message: "Invalid due date", path: ["dueDate"], code: "custom" }]);
      }
      updateData.due_date = dueDate.toISOString();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "No valid fields provided"
      }, { status: 400 });
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from("challenges")
      .update(updateData)
      .eq("id", challengeId)
      .select("*, projects(name)")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ChallengeRecord>>({
      success: true,
      data: mapChallenge(data)
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
    const challengeId = z.string().uuid().parse(params.id);

    const supabase = getAdminSupabaseClient();
    const { error } = await supabase.from("challenges").delete().eq("id", challengeId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse>({ success: true });
  } catch (error) {
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid challenge id" : parseErrorMessage(error)
    }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
