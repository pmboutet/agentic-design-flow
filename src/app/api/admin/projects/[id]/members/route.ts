import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/supabaseServer";
import { canManageProjectMembers } from "@/lib/memberPermissions";
import { sanitizeOptional } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse } from "@/types";

const payloadSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
  role: z.string().trim().max(50).optional(),
  jobTitle: z.string().trim().max(255).optional().or(z.literal(""))
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify user is admin
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const projectId = z.string().uuid("Invalid project id").parse(resolvedParams.id);

    // Check if user can manage members of this project
    const permission = await canManageProjectMembers(profile, projectId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    const body = await request.json();
    const payload = payloadSchema.parse(body);

    const supabase = getAdminSupabaseClient();
    const jobTitle = payload.jobTitle ? sanitizeOptional(payload.jobTitle || null) : undefined;
    
    const upsertData: Record<string, unknown> = {
      project_id: projectId,
      user_id: payload.userId,
      role: payload.role ?? "member"
    };
    
    if (jobTitle !== undefined) {
      upsertData.job_title = jobTitle;
    }

    const { error } = await supabase
      .from("project_members")
      .upsert(upsertData, { onConflict: "project_id,user_id" });

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null
    }, { status: 201 });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) {
      status = 400;
    } else if (error instanceof Error && error.message.includes("required")) {
      status = 403;
    }
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}
