import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ManagedUser } from "@/types";
import { fetchProjectMemberships, mapManagedUser } from "../helpers";

const roleValues = ["full_admin", "project_admin", "facilitator", "manager", "participant", "user"] as const;

const updateSchema = z.object({
  email: z.string().trim().min(3).max(255).email().optional(),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  role: z.enum(roleValues).optional(),
  clientId: z.string().uuid().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  jobTitle: z.string().trim().max(255).optional().or(z.literal(""))
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    
    const userId = z.string().uuid().parse(params.id);
    const body = await request.json();
    const payload = updateSchema.parse(body);

    let currentFirstName: string | null | undefined;
    let currentLastName: string | null | undefined;
    if (payload.firstName !== undefined || payload.lastName !== undefined) {
      const { data: existing, error: fetchError } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", userId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      currentFirstName = existing?.first_name ?? null;
      currentLastName = existing?.last_name ?? null;
    }

    const updateData: Record<string, any> = {};

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

    const membershipMap = await fetchProjectMemberships(supabase, [data.id]);

    return NextResponse.json<ApiResponse<ManagedUser>>({
      success: true,
      data: mapManagedUser(data, membershipMap)
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

