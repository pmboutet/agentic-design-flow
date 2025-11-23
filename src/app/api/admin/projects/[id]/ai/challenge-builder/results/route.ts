import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type AiChallengeBuilderResponse } from "@/types";

// Type for persisted results
interface PersistedChallengeBuilderResults {
  suggestions: AiChallengeBuilderResponse["challengeSuggestions"];
  newChallenges: AiChallengeBuilderResponse["newChallengeSuggestions"];
  errors: AiChallengeBuilderResponse["errors"] | null;
  lastRunAt: string; // ISO timestamp
  projectId: string;
}

/**
 * GET /api/admin/projects/[id]/ai/challenge-builder/results
 * Retrieve persisted AI challenge builder results for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    const resolvedParams = await params;
    const projectId = z.string().uuid().parse(resolvedParams.id);

    const { data: project, error } = await supabase
      .from("projects")
      .select("ai_challenge_builder_results")
      .eq("id", projectId)
      .single();

    if (error) {
      throw error;
    }

    const results = project?.ai_challenge_builder_results as PersistedChallengeBuilderResults | null;

    if (!results) {
      return NextResponse.json<ApiResponse<PersistedChallengeBuilderResults | null>>({
        success: true,
        data: null,
      });
    }

    return NextResponse.json<ApiResponse<PersistedChallengeBuilderResults>>({
      success: true,
      data: results,
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    else if (error instanceof Error && error.message.includes('required')) status = 403;

    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid project id" : parseErrorMessage(error),
    }, { status });
  }
}

/**
 * POST /api/admin/projects/[id]/ai/challenge-builder/results
 * Save AI challenge builder results for a project
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    const resolvedParams = await params;
    const projectId = z.string().uuid().parse(resolvedParams.id);

    const body = await request.json();
    const { suggestions, newChallenges, errors } = body as {
      suggestions?: AiChallengeBuilderResponse["challengeSuggestions"];
      newChallenges?: AiChallengeBuilderResponse["newChallengeSuggestions"];
      errors?: AiChallengeBuilderResponse["errors"];
    };

    const persistedResults: PersistedChallengeBuilderResults = {
      suggestions: suggestions ?? [],
      newChallenges: newChallenges ?? [],
      errors: errors ?? null,
      lastRunAt: new Date().toISOString(),
      projectId,
    };

    const { error } = await supabase
      .from("projects")
      .update({ ai_challenge_builder_results: persistedResults })
      .eq("id", projectId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<PersistedChallengeBuilderResults>>({
      success: true,
      data: persistedResults,
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    else if (error instanceof Error && error.message.includes('required')) status = 403;

    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error),
    }, { status });
  }
}




