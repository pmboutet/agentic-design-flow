import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { buildGraphologyGraph, findShortestPath } from "@/lib/graphRAG/graphAnalysis";
import type { ApiResponse } from "@/types";

/**
 * GET /api/admin/graph/path
 *
 * Find the shortest path between two nodes in the knowledge graph.
 * Uses Dijkstra's algorithm via Graphology.
 *
 * Query params:
 * - projectId: Project ID (required)
 * - from: Source node ID (required)
 * - to: Target node ID (required)
 * - includeEntities: Include entity nodes in graph (default: true)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get("projectId");
    const fromId = searchParams.get("from");
    const toId = searchParams.get("to");
    const includeEntities = searchParams.get("includeEntities") !== "false";

    // Validate required params
    if (!projectId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Missing required parameter: projectId" },
        { status: 400 }
      );
    }

    if (!fromId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Missing required parameter: from" },
        { status: 400 }
      );
    }

    if (!toId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Missing required parameter: to" },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();

    // Build the graph
    const graph = await buildGraphologyGraph(supabase, projectId, {
      includeEntities,
    });

    // Find shortest path
    const result = findShortestPath(graph, fromId, toId);

    if (!result) {
      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          path: null,
          message: "No path found between the specified nodes",
          fromId,
          toId,
        },
      });
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        ...result,
        fromId,
        toId,
      },
    });
  } catch (error) {
    console.error("Error finding shortest path:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to find path",
      },
      { status: 500 }
    );
  }
}
