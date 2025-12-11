import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/supabaseServer";
import { canManageClientMembers } from "@/lib/memberPermissions";
import { sanitizeOptional } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ClientMember, type ClientRole } from "@/types";

const clientRoles = ["client_admin", "facilitator", "manager", "participant"] as const;

const updateSchema = z.object({
  role: z.enum(clientRoles).optional(),
  jobTitle: z.string().trim().max(255).optional().or(z.literal(""))
});

function mapClientMember(row: any): ClientMember {
  return {
    id: row.id,
    clientId: row.client_id,
    userId: row.user_id,
    role: (row.role || 'participant') as ClientRole,
    jobTitle: row.job_title ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    // Verify user is admin
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const clientId = z.string().uuid("Invalid client id").parse(resolvedParams.id);
    const userId = z.string().uuid("Invalid user id").parse(resolvedParams.userId);

    // Check if user can manage members of this client
    const permission = await canManageClientMembers(profile, clientId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    const body = await request.json();
    const payload = updateSchema.parse(body);

    const supabase = getAdminSupabaseClient();

    const updateData: Record<string, unknown> = {};
    if (payload.role !== undefined) {
      updateData.role = payload.role;
    }
    if (payload.jobTitle !== undefined) {
      updateData.job_title = sanitizeOptional(payload.jobTitle || null);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "No valid fields provided"
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("client_members")
      .update(updateData)
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ClientMember>>({
      success: true,
      data: mapClientMember(data)
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    // Verify user is admin
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const clientId = z.string().uuid("Invalid client id").parse(resolvedParams.id);
    const userId = z.string().uuid("Invalid user id").parse(resolvedParams.userId);

    // Check if user can manage members of this client
    const permission = await canManageClientMembers(profile, clientId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    const supabase = getAdminSupabaseClient();
    const { error } = await supabase
      .from("client_members")
      .delete()
      .eq("client_id", clientId)
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
