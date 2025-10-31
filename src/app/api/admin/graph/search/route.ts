import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { findInsightsByConcepts } from "@/lib/graphRAG/graphQueries";
import type { ApiResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      query,
      searchType = "semantic",
      projectId,
      limit = 20,
      threshold = 0.75,
    } = body as {
      query: string;
      searchType?: "semantic" | "keyword" | "graph";
      projectId?: string;
      limit?: number;
      threshold?: number;
    };

    if (!query || typeof query !== "string") {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Query is required",
        },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();
    const results: Array<{
      id: string;
      type: string;
      score?: number;
      method: string;
    }> = [];

    if (searchType === "semantic" || searchType === "graph") {
        // Semantic search using embeddings
      try {
        const queryEmbedding = await generateEmbedding(query);

        // Use vector similarity search
        const { data: similarInsights, error: vectorError } = await supabase.rpc(
          "find_similar_insights",
          {
            query_embedding: queryEmbedding, // Pass array directly
            match_threshold: threshold,
            match_count: limit,
          }
        ).catch(() => {
          // Fallback: return empty if function doesn't exist yet
          return { data: [], error: null };
        });

        if (!vectorError && similarInsights) {
          for (const insight of similarInsights) {
            results.push({
              id: insight.id,
              type: "insight",
              score: insight.similarity || undefined,
              method: "semantic",
            });
          }
        }
      } catch (error) {
        console.error("Error in semantic search:", error);
      }
    }

    if (searchType === "keyword" || searchType === "graph") {
      // Keyword search using knowledge entities
      try {
        const conceptMatches = await findInsightsByConcepts(
          supabase,
          [query], // Simple: treat query as single concept
          projectId
        );

        for (const insightId of conceptMatches) {
          if (!results.find((r) => r.id === insightId)) {
            results.push({
              id: insightId,
              type: "insight",
              method: "keyword",
            });
          }
        }
      } catch (error) {
        console.error("Error in keyword search:", error);
      }
    }

    // Remove duplicates and limit results
    const uniqueResults = Array.from(
      new Map(results.map((r) => [r.id, r])).values()
    ).slice(0, limit);

    // Sort by score if available
    uniqueResults.sort((a, b) => {
      if (a.score && b.score) {
        return b.score - a.score;
      }
      if (a.score) return -1;
      if (b.score) return 1;
      return 0;
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: uniqueResults,
    });
  } catch (error) {
    console.error("Error in graph search:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to search graph",
      },
      { status: 500 }
    );
  }
}

