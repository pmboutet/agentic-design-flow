import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
  isActive: z.boolean().default(true)
});

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from("users")
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
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = userSchema.parse(body);

    const supabase = getAdminSupabaseClient();
    const firstName = sanitizeOptional(payload.firstName || null);
    const lastName = sanitizeOptional(payload.lastName || null);
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

    const { data, error } = await supabase
      .from("users")
      .insert({
        email: sanitizeText(payload.email.toLowerCase()),
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
      throw error;
    }

    const membershipMap = await fetchProjectMemberships(supabase, [data.id]);

    return NextResponse.json<ApiResponse<ManagedUser>>({
      success: true,
      data: mapManagedUser(data, membershipMap)
    }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}
