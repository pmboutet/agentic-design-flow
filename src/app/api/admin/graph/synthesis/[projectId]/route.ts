import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import {
  updateSynthesesForProject,
  findRelatedInsightClusters,
  synthesizeInsightCluster,
} from "@/lib/graphRAG/synthesis";
import type { ApiResponse } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const supabase = getAdminSupabaseClient();

    // Get all syntheses for the project
    const { data: syntheses, error } = await supabase
      .from("insight_syntheses")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: syntheses || [],
    });
  } catch (error) {
    console.error("Error fetching syntheses:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch syntheses",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const supabase = getAdminSupabaseClient();

    // Force generation of syntheses
    const results = await updateSynthesesForProject(projectId);

    // Fetch the created syntheses to return full data structure
    const { data: syntheses, error } = await supabase
      .from("insight_syntheses")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Map to match Synthesis interface
    const mappedSyntheses = (syntheses || []).map((s) => ({
      id: s.id,
      synthesized_text: s.synthesized_text,
      source_insight_ids: s.source_insight_ids || [],
      key_concepts: s.key_concepts || [],
      created_at: s.created_at,
    }));

    return NextResponse.json<ApiResponse>({
      success: true,
      data: mappedSyntheses,
      message: `Generated ${results.length} syntheses`,
    });
  } catch (error) {
    console.error("Error generating syntheses:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate syntheses",
      },
      { status: 500 }
    );
  }
}

