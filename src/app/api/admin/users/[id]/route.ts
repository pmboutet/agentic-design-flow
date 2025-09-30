import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ManagedUser } from "@/types";

const roleValues = ["full_admin", "project_admin", "facilitator", "manager", "participant", "user"] as const;

const updateSchema = z.object({
  email: z.string().trim().min(3).max(255).email().optional(),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  role: z.enum(roleValues).optional(),
  clientId: z.string().uuid().optional().or(z.literal("")),
  isActive: z.boolean().optional()
});

function mapUser(row: any): ManagedUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name,
    role: row.role,
    clientId: row.client_id,
    clientName: row.clients?.name ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = z.string().uuid().parse(params.id);
    const body = await request.json();
    const payload = updateSchema.parse(body);

    const supabase = getAdminSupabaseClient();

    let currentFirstName: string | null | undefined;
    let currentLastName: string | null | undefined;
    if (payload.firstName !== undefined || payload.lastName !== undefined) {
      const { data: existing, error: fetchError } = await supabase
        .from("users")
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
      .from("users")
      .update(updateData)
      .eq("id", userId)
      .select("*, clients(name)")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ManagedUser>>({
      success: true,
      data: mapUser(data)
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}
