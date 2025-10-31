import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { findInsightClusters } from "@/lib/graphRAG/graphQueries";
import type { ApiResponse } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const searchParams = request.nextUrl.searchParams;
    const minClusterSize = parseInt(searchParams.get("minSize") || "3", 10);

    const supabase = getAdminSupabaseClient();

    const clusters = await findInsightClusters(supabase, projectId, minClusterSize);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: clusters,
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

