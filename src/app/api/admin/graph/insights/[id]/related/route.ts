import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { findRelatedInsights } from "@/lib/graphRAG/graphQueries";
import type { ApiResponse } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const depth = parseInt(searchParams.get("depth") || "2", 10);
    const typesParam = searchParams.get("types") || "SIMILAR_TO,RELATED_TO";
    const relationshipTypes = typesParam.split(",").map((t) => t.trim());

    const supabase = getAdminSupabaseClient();

    const related = await findRelatedInsights(
      supabase,
      id,
      depth,
      relationshipTypes
    );

    return NextResponse.json<ApiResponse>({
      success: true,
      data: related,
    });
  } catch (error) {
    console.error("Error finding related insights:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to find related insights",
      },
      { status: 500 }
    );
  }
}

