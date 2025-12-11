import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/supabaseServer";
import { canManageProjectMembers } from "@/lib/memberPermissions";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse } from "@/types";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    // Verify user is admin
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const projectId = z.string().uuid("Invalid project id").parse(resolvedParams.id);
    const userId = z.string().uuid("Invalid user id").parse(resolvedParams.userId);

    // Check if user can manage members of this project
    const permission = await canManageProjectMembers(profile, projectId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    const supabase = getAdminSupabaseClient();
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) {
      status = 400;
    } else if (error instanceof Error && error.message.includes("required")) {
      status = 403;
    }
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid parameters" : parseErrorMessage(error)
    }, { status });
  }
}
