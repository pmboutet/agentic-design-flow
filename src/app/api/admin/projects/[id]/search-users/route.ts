import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/supabaseServer";
import { canSearchProjectUsers } from "@/lib/memberPermissions";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ProjectMember } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify user is admin
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const projectId = z.string().uuid("Invalid project id").parse(resolvedParams.id);

    // Check if user can search users for this project
    const permission = await canSearchProjectUsers(profile, projectId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query")?.trim() || "";

    const supabase = getAdminSupabaseClient();

    // First get the project's clientId
    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("client_id")
      .eq("id", projectId)
      .single();

    if (projectError || !projectData) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Project not found",
      }, { status: 404 });
    }

    const clientId = projectData.client_id;

    // Get existing project members to exclude them from search
    const { data: memberData } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);

    const existingMemberIds = new Set((memberData ?? []).map(m => m.user_id));

    // Search for users in the same client
    let usersQuery = supabase
      .from("profiles")
      .select("id, full_name, email, role, job_title, is_active, client_id")
      .eq("is_active", true);

    // Filter by client if project has a client
    if (clientId) {
      usersQuery = usersQuery.or(`client_id.eq.${clientId},role.ilike.%admin%,role.ilike.%owner%`);
    }

    // Apply search filter if query provided
    if (query) {
      usersQuery = usersQuery.or(`full_name.ilike.%${query}%,email.ilike.%${query}%,job_title.ilike.%${query}%`);
    }

    const { data: usersData, error: usersError } = await usersQuery.limit(50);

    if (usersError) {
      throw usersError;
    }

    // Filter out existing members and map to ProjectMember format
    const availableUsers: ProjectMember[] = (usersData ?? [])
      .filter(user => !existingMemberIds.has(user.id))
      .map(user => ({
        id: user.id,
        fullName: user.full_name ?? null,
        email: user.email ?? null,
        role: user.role ?? null,
        jobTitle: user.job_title ?? null,
      }))
      .sort((a, b) => {
        const nameA = (a.fullName || a.email || "").toLowerCase();
        const nameB = (b.fullName || b.email || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

    return NextResponse.json<ApiResponse<ProjectMember[]>>({
      success: true,
      data: availableUsers,
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
      error: error instanceof z.ZodError
        ? error.errors[0]?.message || "Invalid parameters"
        : parseErrorMessage(error),
    }, { status });
  }
}
