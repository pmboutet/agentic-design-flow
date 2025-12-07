import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ManagedUser } from "@/types";
import { fetchProjectMemberships, fetchClientMemberships, fetchDetailedProjectMemberships, mapManagedUser } from "../helpers";

const roleValues = ["full_admin", "client_admin", "facilitator", "manager", "participant"] as const;

const updateSchema = z.object({
  email: z.string().trim().min(3).max(255).email().optional(),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  role: z.enum(roleValues).optional(),
  clientId: z.string().uuid().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  jobTitle: z.string().trim().max(255).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal(""))
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    const resolvedParams = await params;
    const userId = z.string().uuid().parse(resolvedParams.id);
    const body = await request.json();
    const payload = updateSchema.parse(body);

    // Check if user exists and is not deleted
    const { data: existingProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("first_name, last_name, deleted_at")
      .eq("id", userId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!existingProfile) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "User not found"
      }, { status: 404 });
    }

    if (existingProfile.deleted_at) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Cannot update a deleted user"
      }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    let currentFirstName: string | null = existingProfile.first_name ?? null;
    let currentLastName: string | null = existingProfile.last_name ?? null;

    if (payload.email !== undefined) {
      updateData.email = sanitizeText(payload.email.toLowerCase());
    }

    if (payload.firstName !== undefined) {
      const sanitized = sanitizeOptional(payload.firstName || null);
      updateData.first_name = sanitized;
      currentFirstName = sanitized ?? null;
    }

    if (payload.lastName !== undefined) {
      const sanitized = sanitizeOptional(payload.lastName || null);
      updateData.last_name = sanitized;
      currentLastName = sanitized ?? null;
    }

    if (payload.role !== undefined) {
      updateData.role = payload.role;
    }

    if (payload.clientId !== undefined) {
      updateData.client_id = payload.clientId && payload.clientId !== "" ? payload.clientId : null;
    }

    if (payload.isActive !== undefined) {
      updateData.is_active = payload.isActive;
    }

    if (payload.jobTitle !== undefined) {
      updateData.job_title = sanitizeOptional(payload.jobTitle || null);
    }

    if (payload.description !== undefined) {
      updateData.description = sanitizeOptional(payload.description || null);
    }

    // Update full_name if firstName or lastName changed
    if (payload.firstName !== undefined || payload.lastName !== undefined) {
      const fullNameParts = [currentFirstName, currentLastName].filter(Boolean) as string[];
      updateData.full_name = fullNameParts.length > 0 ? fullNameParts.join(" ") : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "No valid fields provided"
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId)
      .select("*, clients(name)")
      .single();

    if (error) {
      throw error;
    }

    const [membershipMap, clientMembershipMap, projectMembershipMap] = await Promise.all([
      fetchProjectMemberships(supabase, [data.id]),
      fetchClientMemberships(supabase, [data.id]),
      fetchDetailedProjectMemberships(supabase, [data.id])
    ]);

    return NextResponse.json<ApiResponse<ManagedUser>>({
      success: true,
      data: mapManagedUser(data, membershipMap, clientMembershipMap, projectMembershipMap)
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    else if (error instanceof Error && error.message.includes('required')) status = 403;
    
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    const resolvedParams = await params;
    const userId = z.string().uuid().parse(resolvedParams.id);

    // Check if user exists and is not already deleted
    const { data: existing, error: fetchError } = await supabase
      .from("profiles")
      .select("id, deleted_at")
      .eq("id", userId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!existing) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "User not found"
      }, { status: 404 });
    }

    if (existing.deleted_at) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "User is already deleted"
      }, { status: 400 });
    }

    // Soft delete: set deleted_at to current timestamp
    const { error } = await supabase
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    else if (error instanceof Error && error.message.includes('required')) status = 403;
    
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid user id" : parseErrorMessage(error)
    }, { status });
  }
}

