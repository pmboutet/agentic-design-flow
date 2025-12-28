import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/supabaseServer";
import { canManageClientMembers } from "@/lib/memberPermissions";
import { sanitizeOptional } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ClientMember, type ClientRole } from "@/types";

const clientRoles = ["client_admin", "facilitator", "manager", "participant"] as const;

const payloadSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
  role: z.enum(clientRoles).optional().default("participant"),
  jobTitle: z.string().trim().max(255).optional().or(z.literal(""))
});

function mapClientMember(row: any): ClientMember {
  // Handle joined profile data (can be object or array depending on query)
  const profile = row.profiles ? (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) : null;

  return {
    id: row.id,
    clientId: row.client_id,
    userId: row.user_id,
    role: (row.role || 'participant') as ClientRole,
    jobTitle: row.job_title ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userEmail: profile?.email ?? null,
    userFirstName: profile?.first_name ?? null,
    userLastName: profile?.last_name ?? null,
    userFullName: profile?.full_name ?? null
  };
}

/**
 * Check if user can view client members (less restrictive than manage)
 * - full_admin: can view any client
 * - client_admin/facilitator/manager: can view their own clients
 */
function canViewClientMembers(
  profile: { role: string | null; client_ids: string[] },
  clientId: string
): { allowed: boolean; error?: string } {
  const normalizedRole = profile.role?.toLowerCase() ?? "";

  // full_admin can view any client
  if (normalizedRole === "full_admin") {
    return { allowed: true };
  }

  // Users with admin-level roles can view their own clients
  if (!profile.client_ids.length || !profile.client_ids.includes(clientId)) {
    return {
      allowed: false,
      error: "You can only view members of your own organization"
    };
  }

  return { allowed: true };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify user is admin
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const clientId = z.string().uuid("Invalid client id").parse(resolvedParams.id);

    // Check if user can view members of this client
    const permission = canViewClientMembers(profile, clientId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied"
      }, { status: 403 });
    }

    const supabase = getAdminSupabaseClient();

    const { data, error } = await supabase
      .from("client_members")
      .select(`
        *,
        profiles:user_id (
          email,
          first_name,
          last_name,
          full_name
        )
      `)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ClientMember[]>>({
      success: true,
      data: (data ?? []).map(mapClientMember)
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify user is admin
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const clientId = z.string().uuid("Invalid client id").parse(resolvedParams.id);

    // Check if user can manage members of this client
    const permission = await canManageClientMembers(profile, clientId);
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
      client_id: clientId,
      user_id: payload.userId,
      role: payload.role || 'participant'
    };

    if (jobTitle !== undefined) {
      upsertData.job_title = jobTitle;
    }

    const { data, error } = await supabase
      .from("client_members")
      .upsert(upsertData, { onConflict: "client_id,user_id" })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ClientMember>>({
      success: true,
      data: mapClientMember(data)
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
