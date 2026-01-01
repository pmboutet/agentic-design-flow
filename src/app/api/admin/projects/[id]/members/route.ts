import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/supabaseServer";
import { canManageProjectMembers } from "@/lib/memberPermissions";
import { sanitizeOptional } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import {
  ensureClientMembership,
  ensureProjectMembership,
  getOrCreateUser,
} from "@/app/api/admin/profiles/helpers";
import { type ApiResponse } from "@/types";

// Schema for adding an existing user
const addExistingUserSchema = z.object({
  userId: z.string().uuid(),
  createUser: z.undefined(),
  role: z.string().trim().max(50).optional(),
  jobTitle: z.string().trim().max(255).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

// Schema for creating a new user
const createUserSchema = z.object({
  userId: z.undefined(),
  createUser: z.object({
    email: z.string().trim().email().max(255),
    firstName: z.string().trim().max(100).optional().or(z.literal("")),
    lastName: z.string().trim().max(100).optional().or(z.literal("")),
    jobTitle: z.string().trim().max(255).optional().or(z.literal("")),
  }),
  role: z.string().trim().max(50).optional(),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

const payloadSchema = z.union([addExistingUserSchema, createUserSchema]);

export interface AddMemberResult {
  userId: string;
  userCreated: boolean;
  addedToClient: boolean;
  addedToProject: boolean;
}

/**
 * POST /api/admin/projects/[id]/members
 *
 * Adds a member to a project with cascade logic:
 * 1. Creates user if needed (createUser mode)
 * 2. Adds user to client_members if not already member
 * 3. Adds user to project_members if not already member
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Auth check
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const projectId = z.string().uuid("Invalid project id").parse(resolvedParams.id);

    // 2. Permission check - also returns projectClientId
    const permission = await canManageProjectMembers(profile, projectId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    // 3. Parse payload
    const body = await request.json();
    const payload = payloadSchema.parse(body);

    const supabase = getAdminSupabaseClient();

    // 4. Get project's clientId
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("client_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project?.client_id) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Project not found or has no client"
      }, { status: 404 });
    }

    const clientId = project.client_id;

    // 5. Get or create user using shared helper
    let userId: string;
    let userCreated: boolean;

    try {
      const userResult = await getOrCreateUser(
        supabase,
        payload.userId,
        payload.createUser ? {
          email: payload.createUser.email,
          firstName: payload.createUser.firstName || undefined,
          lastName: payload.createUser.lastName || undefined,
          jobTitle: payload.createUser.jobTitle || undefined,
        } : undefined
      );
      userId = userResult.userId;
      userCreated = userResult.userCreated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "User operation failed";
      const status = message === "User not found" ? 404 : 400;
      return NextResponse.json<ApiResponse>({
        success: false,
        error: message
      }, { status });
    }

    // 6. Cascade: Ensure user is a client member
    const addedToClient = await ensureClientMembership(supabase, clientId, userId);

    // 7. Cascade: Ensure user is a project member
    const addedToProject = await ensureProjectMembership(supabase, projectId, userId);

    // 8. Update job_title/description if provided (for existing project members)
    const jobTitle = 'jobTitle' in payload && payload.jobTitle
      ? sanitizeOptional(payload.jobTitle)
      : undefined;
    const description = 'description' in payload && payload.description !== undefined
      ? sanitizeOptional(payload.description)
      : undefined;

    // Build update data for project member
    const updateData: Record<string, unknown> = {};
    if (payload.role) {
      updateData.role = payload.role;
    }
    if (jobTitle !== undefined) {
      updateData.job_title = jobTitle;
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    if (Object.keys(updateData).length > 0) {
      // Update project member data (works for both new and existing members)
      await supabase
        .from("project_members")
        .update(updateData)
        .eq("project_id", projectId)
        .eq("user_id", userId);
    }

    const result: AddMemberResult = {
      userId,
      userCreated,
      addedToClient,
      addedToProject,
    };

    return NextResponse.json<ApiResponse<AddMemberResult>>({
      success: true,
      data: result
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
      error: error instanceof z.ZodError
        ? error.errors[0]?.message || "Invalid payload"
        : parseErrorMessage(error)
    }, { status });
  }
}
