import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ManagedUser } from "@/types";
import { fetchProjectMemberships, fetchClientMemberships, fetchDetailedProjectMemberships, mapManagedUser } from "./helpers";

const roleValues = ["full_admin", "client_admin", "facilitator", "manager", "participant"] as const;

const userSchema = z.object({
  email: z.string().trim().min(3).max(255).email(),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  role: z.enum(roleValues).default("participant"),
  clientId: z.string().uuid().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  password: z.string().min(6).optional(), // For creating auth user
  jobTitle: z.string().trim().max(255).optional().or(z.literal("")),
});

export async function GET(request: NextRequest) {
  try {
    // Verify user is admin and get authenticated client
    const { profile: adminProfile } = await requireAdmin();
    const supabase = await createServerSupabaseClient();

    const role = adminProfile.role?.toLowerCase() ?? "";
    const isFullAdmin = role === "full_admin";

    // Check for email query parameter for lookup
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (email) {
      // Email lookup endpoint
      const sanitizedEmail = sanitizeText(email.toLowerCase());
      const query = supabase
        .from("profiles")
        .select("*")
        .eq("email", sanitizedEmail)
        .is("deleted_at", null);

      // Note: Client-based filtering removed - use clientMemberships for access control
      const { data, error } = await query.maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return NextResponse.json<ApiResponse<ManagedUser | null>>({
          success: true,
          data: null
        });
      }

      const [membershipMap, clientMembershipMap, projectMembershipMap] = await Promise.all([
        fetchProjectMemberships(supabase, [data.id]),
        fetchClientMemberships(supabase, [data.id]),
        fetchDetailedProjectMemberships(supabase, [data.id])
      ]);

      return NextResponse.json<ApiResponse<ManagedUser | null>>({
        success: true,
        data: mapManagedUser(data, membershipMap, clientMembershipMap, projectMembershipMap)
      });
    }

    // Regular GET all profiles (exclude deleted users)
    const query = supabase
      .from("profiles")
      .select("*")
      .is("deleted_at", null);

    // Note: Client-based filtering removed - use clientMemberships for access control
    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const userIds = (data ?? []).map(row => row.id).filter((id): id is string => Boolean(id));
    const [membershipMap, clientMembershipMap, projectMembershipMap] = await Promise.all([
      fetchProjectMemberships(supabase, userIds),
      fetchClientMemberships(supabase, userIds),
      fetchDetailedProjectMemberships(supabase, userIds)
    ]);

    return NextResponse.json<ApiResponse<ManagedUser[]>>({
      success: true,
      data: (data ?? []).map(row => mapManagedUser(row, membershipMap, clientMembershipMap, projectMembershipMap))
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
    console.log("[POST /api/admin/profiles] Starting user creation");
    
    // Verify user is admin
    await requireAdmin();
    console.log("[POST /api/admin/profiles] Admin verified");
    
    const body = await request.json();
    console.log("[POST /api/admin/profiles] Request body:", body);
    
    const payload = userSchema.parse(body);
    console.log("[POST /api/admin/profiles] Validated payload:", payload);

    // Use admin client for auth.admin operations (creating auth users)
    const adminSupabase = getAdminSupabaseClient();
    // Use authenticated client for RLS-enabled operations
    const supabase = await createServerSupabaseClient();
    const firstName = sanitizeOptional(payload.firstName || null);
    const lastName = sanitizeOptional(payload.lastName || null);
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const email = sanitizeText(payload.email.toLowerCase());

    console.log("[POST /api/admin/profiles] Checking for existing email:", email);

    // Check if email already exists
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (checkError) {
      console.error("[POST /api/admin/profiles] Error checking email:", checkError);
      throw new Error(`Failed to check existing email: ${checkError.message}`);
    }

    if (existingProfile) {
      console.log("[POST /api/admin/profiles] Email already exists");
      return NextResponse.json<ApiResponse>({
        success: false,
        error: `A user with email ${email} already exists`
      }, { status: 409 });
    }

    console.log("[POST /api/admin/profiles] Email is available, proceeding with creation");

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
    const jobTitle = sanitizeOptional(payload.jobTitle || null);
    
    const insertData = {
      auth_id: authId,
      email,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      role: payload.role,
      is_active: payload.isActive,
      job_title: jobTitle
    };

    console.log("[POST /api/admin/profiles] Inserting profile:", insertData);

    const { data, error } = await supabase
      .from("profiles")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      console.error("[POST /api/admin/profiles] Error inserting profile:", error);
      // If profile creation fails but auth user was created, clean up
      if (authId) {
        await adminSupabase.auth.admin.deleteUser(authId);
      }
      throw error;
    }

    console.log("[POST /api/admin/profiles] Profile created successfully:", data.id);

    // Add client membership if clientId provided
    if (payload.clientId && payload.clientId !== "") {
      const { error: memberError } = await adminSupabase
        .from("client_members")
        .insert({
          user_id: data.id,
          client_id: payload.clientId,
          role: payload.role === "client_admin" ? "admin" : "member",
        });

      if (memberError) {
        console.warn("[POST /api/admin/profiles] Failed to add client membership:", memberError);
      }
    }

    const [membershipMap, clientMembershipMap, projectMembershipMap] = await Promise.all([
      fetchProjectMemberships(supabase, [data.id]),
      fetchClientMemberships(supabase, [data.id]),
      fetchDetailedProjectMemberships(supabase, [data.id])
    ]);
    console.log("[POST /api/admin/profiles] Membership maps fetched");

    const mappedUser = mapManagedUser(data, membershipMap, clientMembershipMap, projectMembershipMap);
    console.log("[POST /api/admin/profiles] Mapped user:", mappedUser);

    return NextResponse.json<ApiResponse<ManagedUser>>({
      success: true,
      data: mappedUser
    }, { status: 201 });
  } catch (error) {
    let status = 500;
    let errorMessage = "An error occurred";
    
    if (error instanceof z.ZodError) {
      status = 400;
      errorMessage = error.errors[0]?.message || "Invalid payload";
      console.error("[POST /api/admin/profiles] Validation error:", error.errors);
    } else if (error instanceof Error) {
      errorMessage = error.message;
      if (error.message.includes('required')) {
        status = 403;
      }
      // Check for common database errors
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        status = 409;
        errorMessage = "A user with this email already exists";
      }
      if (error.message.includes('foreign key') || error.message.includes('constraint')) {
        status = 400;
        errorMessage = `Invalid data: ${error.message}`;
      }
      console.error("[POST /api/admin/profiles] Error:", error);
      console.error("[POST /api/admin/profiles] Error stack:", error.stack);
    } else {
      console.error("[POST /api/admin/profiles] Unknown error:", error);
      errorMessage = `Unexpected error: ${JSON.stringify(error)}`;
    }
    
    return NextResponse.json<ApiResponse>({
      success: false,
      error: errorMessage
    }, { status });
  }
}

