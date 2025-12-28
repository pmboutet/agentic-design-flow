import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import type { ApiResponse, PersistedAskSuggestions } from "@/types";

/**
 * GET /api/admin/challenges/[id]/ai/ask-suggestions
 * Returns the persisted AI ASK suggestions for a challenge
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const challengeId = z.string().uuid().parse(resolvedParams.id);

    const supabase = getAdminSupabaseClient();

    const { data, error } = await supabase
      .from("challenges")
      .select("ai_ask_suggestions")
      .eq("id", challengeId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Challenge not found",
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<PersistedAskSuggestions | null>>({
      success: true,
      data: data.ai_ask_suggestions as PersistedAskSuggestions | null,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message ?? "Invalid request" : parseErrorMessage(error),
    }, { status });
  }
}

/**
 * POST /api/admin/challenges/[id]/ai/ask-suggestions
 * Re-triggers AI ASK suggestion generation for a challenge
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const challengeId = z.string().uuid().parse(resolvedParams.id);

    const supabase = getAdminSupabaseClient();

    // Verify challenge exists
    const { data: challenge, error: challengeError } = await supabase
      .from("challenges")
      .select("id")
      .eq("id", challengeId)
      .maybeSingle();

    if (challengeError) {
      throw challengeError;
    }

    if (!challenge) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Challenge not found",
      }, { status: 404 });
    }

    // Set status to pending before triggering generation
    const pendingPayload: PersistedAskSuggestions = {
      suggestions: [],
      status: "pending",
      lastRunAt: new Date().toISOString(),
      error: null,
    };

    await supabase
      .from("challenges")
      .update({ ai_ask_suggestions: pendingPayload })
      .eq("id", challengeId);

    // Trigger generation via ask-generator API (fire-and-forget)
    const baseUrl = request.headers.get("host") ?? "localhost:3000";
    const protocol = baseUrl.includes("localhost") ? "http" : "https";

    // Parse request body for optional parameters
    const body = await request.json().catch(() => ({}));

    fetch(`${protocol}://${baseUrl}/api/admin/challenges/${challengeId}/ai/ask-generator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(console.error);

    return NextResponse.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: "Generation started" },
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message ?? "Invalid request" : parseErrorMessage(error),
    }, { status });
  }
}

/**
 * DELETE /api/admin/challenges/[id]/ai/ask-suggestions
 * Clears the persisted AI ASK suggestions for a challenge
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const challengeId = z.string().uuid().parse(resolvedParams.id);

    const supabase = getAdminSupabaseClient();

    const { error } = await supabase
      .from("challenges")
      .update({ ai_ask_suggestions: null })
      .eq("id", challengeId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: "Suggestions cleared" },
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message ?? "Invalid request" : parseErrorMessage(error),
    }, { status });
  }
}
