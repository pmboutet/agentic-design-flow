import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { findInsightClusters } from "@/lib/graphRAG/graphQueries";
import { buildGraphologyGraph, detectCommunities } from "@/lib/graphRAG/graphAnalysis";
import { getCachedCommunities, setCachedCommunities } from "@/lib/graphRAG/graphAnalysisCache";
import type { ApiResponse } from "@/types";

/**
 * GET /api/admin/graph/clusters/[projectId]
 *
 * Find insight clusters in a project's knowledge graph.
 *
 * Query params:
 * - minSize: Minimum cluster size (default: 3)
 * - algorithm: "connected_components" (default) or "louvain"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const minClusterSize = parseInt(searchParams.get("minSize") || "3", 10);
    const algorithm = searchParams.get("algorithm") || "connected_components";

    const supabase = getAdminSupabaseClient();

    // Use Louvain algorithm if requested
    if (algorithm === "louvain") {
      // Check cache first
      const cached = getCachedCommunities(projectId);
      if (cached) {
        const filteredClusters = cached
          .filter((c) => c.size >= minClusterSize)
          .map((c) => ({
            id: c.nodeIds[0], // Use first node as cluster ID for compatibility
            insightIds: c.nodeIds,
            size: c.size,
            averageSimilarity: c.cohesion,
            communityId: c.id,
            dominantType: c.dominantType,
          }));

        return NextResponse.json<ApiResponse>({
          success: true,
          data: { clusters: filteredClusters, algorithm: "louvain", fromCache: true },
        });
      }

      // Build graph and detect communities
      const graph = await buildGraphologyGraph(supabase, projectId, {
        includeEntities: false, // Only insights for clustering
      });

      const communities = detectCommunities(graph);

      // Cache the communities
      setCachedCommunities(projectId, communities);

      // Map to existing InsightCluster format for compatibility
      const clusters = communities
        .filter((c) => c.size >= minClusterSize)
        .map((c) => ({
          id: c.nodeIds[0],
          insightIds: c.nodeIds,
          size: c.size,
          averageSimilarity: c.cohesion,
          communityId: c.id,
          dominantType: c.dominantType,
        }));

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { clusters, algorithm: "louvain", fromCache: false },
      });
    }

    // Default: use existing connected components algorithm
    const clusters = await findInsightClusters(supabase, projectId, minClusterSize);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { clusters, algorithm: "connected_components" },
    });
  } catch (error) {
    console.error("Error finding insight clusters:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to find clusters",
      },
      { status: 500 }
    );
  }
}

