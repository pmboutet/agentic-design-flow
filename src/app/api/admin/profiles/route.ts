import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ManagedUser } from "@/types";
import { fetchProjectMemberships, mapManagedUser } from "./helpers";

const roleValues = ["full_admin", "project_admin", "facilitator", "manager", "participant", "user"] as const;

const userSchema = z.object({
  email: z.string().trim().min(3).max(255).email(),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  role: z.enum(roleValues).default("user"),
  clientId: z.string().uuid().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  password: z.string().min(6).optional(), // For creating auth user
});

export async function GET() {
  try {
    // Verify user is admin and get authenticated client
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    
    const { data, error } = await supabase
      .from("profiles")
      .select("*, clients(name)")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const userIds = (data ?? []).map(row => row.id).filter((id): id is string => Boolean(id));
    const membershipMap = await fetchProjectMemberships(supabase, userIds);

    return NextResponse.json<ApiResponse<ManagedUser[]>>({
      success: true,
      data: (data ?? []).map(row => mapManagedUser(row, membershipMap))
    });
  } catch (error) {
    const status = error instanceof Error && error.message.includes('required') ? 403 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is admin
    await requireAdmin();
    
    const body = await request.json();
    const payload = userSchema.parse(body);

    // Use admin client for auth.admin operations (creating auth users)
    const adminSupabase = getAdminSupabaseClient();
    // Use authenticated client for RLS-enabled operations
    const supabase = await createServerSupabaseClient();
    const firstName = sanitizeOptional(payload.firstName || null);
    const lastName = sanitizeOptional(payload.lastName || null);
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const email = sanitizeText(payload.email.toLowerCase());

    // Create user in Supabase Auth first (if password provided)
    let authId: string | null = null;
    if (payload.password) {
      const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
        email,
        password: payload.password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          full_name: fullName,
          fullName,
          first_name: firstName,
          firstName,
          last_name: lastName,
          lastName,
          role: payload.role,
        },
      });

      if (authError) {
        throw new Error(`Failed to create auth user: ${authError.message}`);
      }

      authId = authData.user.id;
    }

    // Note: If password is not provided, profile is created without auth_id
    // This allows for profiles that will be linked to auth users later
    const { data, error } = await supabase
      .from("profiles")
      .insert({
        auth_id: authId,
        email,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        role: payload.role,
        client_id: payload.clientId && payload.clientId !== "" ? payload.clientId : null,
        is_active: payload.isActive
      })
      .select("*, clients(name)")
      .single();

    if (error) {
      // If profile creation fails but auth user was created, clean up
      if (authId) {
        await adminSupabase.auth.admin.deleteUser(authId);
      }
      throw error;
    }

    const membershipMap = await fetchProjectMemberships(supabase, [data.id]);

    return NextResponse.json<ApiResponse<ManagedUser>>({
      success: true,
      data: mapManagedUser(data, membershipMap)
    }, { status: 201 });
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

