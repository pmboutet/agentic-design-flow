import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { computeGraphAnalytics } from "@/lib/graphRAG/graphAnalysis";
import { getCachedAnalytics, setCachedAnalytics } from "@/lib/graphRAG/graphAnalysisCache";
import type { ApiResponse } from "@/types";

/**
 * GET /api/admin/graph/analytics/[projectId]
 *
 * Compute full graph analytics for a project using Graphology:
 * - Louvain community detection
 * - Centrality metrics (betweenness, PageRank, degree)
 * - Top nodes by each metric
 *
 * Query params:
 * - refresh: "true" to bypass cache
 * - includeEntities: "true" to include entity nodes (default: true)
 * - maxNodes: maximum number of nodes to process (default: 1000)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const forceRefresh = searchParams.get("refresh") === "true";
    const includeEntities = searchParams.get("includeEntities") !== "false";
    const maxNodes = parseInt(searchParams.get("maxNodes") || "1000", 10);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedAnalytics(projectId);
      if (cached) {
        return NextResponse.json<ApiResponse>({
          success: true,
          data: { ...cached, fromCache: true },
        });
      }
    }

    const supabase = getAdminSupabaseClient();

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !project) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Compute analytics
    const analytics = await computeGraphAnalytics(supabase, projectId, {
      includeEntities,
      maxNodes,
    });

    // Cache the result
    setCachedAnalytics(projectId, analytics);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { ...analytics, fromCache: false },
    });
  } catch (error) {
    console.error("Error computing graph analytics:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to compute analytics",
      },
      { status: 500 }
    );
  }
}
