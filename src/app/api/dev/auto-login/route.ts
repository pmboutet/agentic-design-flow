import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { type ApiResponse } from "@/types";
import { SignJWT } from "jose";

interface AutoLoginRequest {
  profileId: string;
}

interface AutoLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Development-only endpoint to create a real Supabase session for auto-login.
 * Creates a valid JWT using the Supabase JWT secret so that Realtime works with RLS policies.
 *
 * Only available when IS_DEV=true
 */
export async function POST(request: NextRequest) {
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
    const body: AutoLoginRequest = await request.json();
    const { profileId } = body;

    if (!profileId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "profileId is required" },
        { status: 400 }
      );
    }

    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "SUPABASE_JWT_SECRET not configured - cannot create dev session" },
        { status: 500 }
      );
    }

    const supabase = getAdminSupabaseClient();

    // Get the profile to find the auth_id and email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, auth_id, email")
      .eq("id", profileId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Profile not found" },
        { status: 404 }
      );
    }

    if (!profile.auth_id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Profile has no auth_id - cannot auto-login" },
        { status: 400 }
      );
    }

    // Get the Supabase user to include proper metadata
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(profile.auth_id);

    if (authError || !authUser?.user) {
      console.error("[dev/auto-login] Failed to get auth user:", authError);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Failed to get auth user" },
        { status: 500 }
      );
    }

    const user = authUser.user;
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 1 hour

    // Create a valid Supabase JWT
    const secret = new TextEncoder().encode(jwtSecret);

    const accessToken = await new SignJWT({
      sub: user.id,
      email: user.email,
      phone: user.phone || "",
      app_metadata: user.app_metadata || {},
      user_metadata: user.user_metadata || {},
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "magiclink", timestamp: now }],
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .setAudience("authenticated")
      .setIssuer(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`)
      .sign(secret);

    // Create a refresh token (simpler structure)
    const refreshToken = await new SignJWT({
      sub: user.id,
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now)
      .setExpirationTime(now + 60 * 60 * 24 * 7) // 7 days
      .sign(secret);

    console.log("[dev/auto-login] JWT session created for:", profile.email);

    return NextResponse.json<ApiResponse<AutoLoginResponse>>({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
        token_type: "bearer",
      },
    });
  } catch (error) {
    console.error("[dev/auto-login] Error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
