import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { type ApiResponse, type ManagedUser } from "@/types";
import { fetchProjectMemberships, fetchClientMemberships, mapManagedUser } from "../../admin/profiles/helpers";

/**
 * Development-only endpoint to list all profiles.
 * Only available when IS_DEV=true
 * Bypasses all authentication and RLS checks.
 */
export async function GET(request: NextRequest) {
  // Only allow in development mode
  if (process.env.IS_DEV !== "true") {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: "This endpoint is only available in development mode",
      },
      { status: 403 }
    );
  }

  try {
    const supabase = getAdminSupabaseClient();

    // Get all profiles (client_id was removed, use client_members for client info)
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const userIds = (data ?? []).map((row) => row.id).filter((id): id is string => Boolean(id));
    const [membershipMap, clientMembershipMap] = await Promise.all([
      fetchProjectMemberships(supabase, userIds),
      fetchClientMemberships(supabase, userIds),
    ]);

    return NextResponse.json<ApiResponse<ManagedUser[]>>({
      success: true,
      data: (data ?? []).map((row) => mapManagedUser(row, membershipMap, clientMembershipMap)),
    });
  } catch (error) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

