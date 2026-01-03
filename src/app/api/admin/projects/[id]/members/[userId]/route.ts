import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/supabaseServer";
import { canManageProjectMembers } from "@/lib/memberPermissions";
import { sanitizeOptional } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse } from "@/types";

// Schema for updating a project member (and optionally the user profile)
const updateMemberSchema = z.object({
  // Project member fields
  role: z.string().trim().max(50).optional().or(z.literal("")), // Permission: owner | admin | member | observer
  jobTitle: z.string().trim().max(255).optional().or(z.literal("")), // Fonction: texte libre
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  // Profile fields (optional - updates the user's profile)
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional(),
});

export interface UpdateMemberResult {
  userId: string;
  updated: boolean;
}

/**
 * PATCH /api/admin/projects/[id]/members/[userId]
 *
 * Updates a project member's role and/or description
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    // 1. Auth check
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const projectId = z.string().uuid("Invalid project id").parse(resolvedParams.id);
    const userId = z.string().uuid("Invalid user id").parse(resolvedParams.userId);

    // 2. Permission check
    const permission = await canManageProjectMembers(profile, projectId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    // 3. Parse payload
    const body = await request.json();
    const payload = updateMemberSchema.parse(body);

    const supabase = getAdminSupabaseClient();

    // 4. Check if member exists
    const { data: existingMember, error: checkError } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (checkError) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Failed to check membership"
      }, { status: 500 });
    }

    if (!existingMember) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "User is not a member of this project"
      }, { status: 404 });
    }

    // 5. Build update data for project_members
    const memberUpdateData: Record<string, unknown> = {};
    if (payload.role !== undefined) {
      memberUpdateData.role = sanitizeOptional(payload.role) || null;
    }
    if (payload.jobTitle !== undefined) {
      memberUpdateData.job_title = sanitizeOptional(payload.jobTitle) || null;
    }
    if (payload.description !== undefined) {
      memberUpdateData.description = sanitizeOptional(payload.description) || null;
    }

    // 6. Build update data for profiles
    const profileUpdateData: Record<string, unknown> = {};
    if (payload.firstName !== undefined) {
      profileUpdateData.first_name = sanitizeOptional(payload.firstName) || null;
    }
    if (payload.lastName !== undefined) {
      profileUpdateData.last_name = sanitizeOptional(payload.lastName) || null;
    }
    if (payload.email !== undefined) {
      profileUpdateData.email = payload.email;
    }

    let updated = false;

    // 7. Update project_members if needed
    if (Object.keys(memberUpdateData).length > 0) {
      const { error: updateError } = await supabase
        .from("project_members")
        .update(memberUpdateData)
        .eq("project_id", projectId)
        .eq("user_id", userId);

      if (updateError) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Failed to update member"
        }, { status: 500 });
      }
      updated = true;
    }

    // 8. Update profiles if needed
    if (Object.keys(profileUpdateData).length > 0) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdateData)
        .eq("id", userId);

      if (profileError) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Failed to update profile"
        }, { status: 500 });
      }
      updated = true;
    }

    return NextResponse.json<ApiResponse<UpdateMemberResult>>({
      success: true,
      data: { userId, updated }
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) {
      status = 400;
    }
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError
        ? error.errors[0]?.message || "Invalid payload"
        : parseErrorMessage(error)
    }, { status });
  }
}

/**
 * DELETE /api/admin/projects/[id]/members/[userId]
 *
 * Removes a user from a project
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    // 1. Auth check
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const projectId = z.string().uuid("Invalid project id").parse(resolvedParams.id);
    const userId = z.string().uuid("Invalid user id").parse(resolvedParams.userId);

    // 2. Permission check
    const permission = await canManageProjectMembers(profile, projectId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    const supabase = getAdminSupabaseClient();

    // 3. Delete the membership
    const { error: deleteError } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (deleteError) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Failed to remove member"
      }, { status: 500 });
    }

    return NextResponse.json<ApiResponse<{ userId: string; removed: boolean }>>({
      success: true,
      data: { userId, removed: true }
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) {
      status = 400;
    }
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError
        ? error.errors[0]?.message || "Invalid payload"
        : parseErrorMessage(error)
    }, { status });
  }
}
