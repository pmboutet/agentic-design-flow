import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { generateEmbedding } from "@/lib/ai/embeddings";
import type { ApiResponse } from "@/types";

export async function GET(_request: NextRequest) {
  try {
    const supabase = getAdminSupabaseClient();

    // Get statistics about embeddings
    const { count: totalInsights } = await supabase
      .from("insights")
      .select("*", { count: "exact", head: true });

    const { count: insightsWithEmbeddings } = await supabase
      .from("insights")
      .select("*", { count: "exact", head: true })
      .not("content_embedding", "is", null);

    const { count: insightsWithoutEmbeddings } = await supabase
      .from("insights")
      .select("*", { count: "exact", head: true })
      .is("content_embedding", null);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        total: totalInsights || 0,
        withEmbeddings: insightsWithEmbeddings || 0,
        withoutEmbeddings: insightsWithoutEmbeddings || 0,
        message: "Use POST method to generate embeddings. Send an empty body to process all insights without embeddings, or include { 'insightId': 'uuid' } to process a specific insight.",
      },
    });
  } catch (error) {
    console.error("Error fetching embedding statistics:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch embedding statistics",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { insightId } = body as { insightId?: string };

    const supabase = getAdminSupabaseClient();

    if (insightId) {
      // Generate embedding for a specific insight
      const { data: insight, error: fetchError } = await supabase
        .from("insights")
        .select("id, content, summary")
        .eq("id", insightId)
        .single();

      if (fetchError || !insight) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: "Insight not found",
          },
          { status: 404 }
        );
      }

      const [contentEmbedding, summaryEmbedding] = await Promise.all([
        insight.content
          ? generateEmbedding(insight.content).catch(() => null)
          : Promise.resolve(null),
        insight.summary
          ? generateEmbedding(insight.summary).catch(() => null)
          : Promise.resolve(null),
      ]);

      const update: Record<string, unknown> = {
        embedding_updated_at: new Date().toISOString(),
      };
      if (contentEmbedding) {
        update.content_embedding = contentEmbedding;
      }
      if (summaryEmbedding) {
        update.summary_embedding = summaryEmbedding;
      }

      const { error: updateError } = await supabase
        .from("insights")
        .update(update)
        .eq("id", insightId);

      if (updateError) {
        throw updateError;
      }

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { insightId, generated: true },
      });
    } else {
      // Batch generate embeddings for insights missing them
      const { data: insights, error: listError } = await supabase
        .from("insights")
        .select("id, content, summary, content_embedding, summary_embedding")
        .or("content_embedding.is.null,summary_embedding.is.null")
        .limit(100); // Process in batches

      if (listError) {
        throw listError;
      }

      if (!insights || insights.length === 0) {
        return NextResponse.json<ApiResponse>({
          success: true,
          data: { processed: 0, message: "No insights need embeddings" },
        });
      }

      let processed = 0;
      let errors = 0;

      for (const insight of insights) {
        try {
          const [contentEmbedding, summaryEmbedding] = await Promise.all([
            insight.content && !insight.content_embedding
              ? generateEmbedding(insight.content).catch(() => null)
              : Promise.resolve(null),
            insight.summary && !insight.summary_embedding
              ? generateEmbedding(insight.summary).catch(() => null)
              : Promise.resolve(null),
          ]);

          const update: Record<string, unknown> = {
            embedding_updated_at: new Date().toISOString(),
          };
          if (contentEmbedding) {
            update.content_embedding = contentEmbedding;
          }
          if (summaryEmbedding) {
            update.summary_embedding = summaryEmbedding;
          }

          await supabase.from("insights").update(update).eq("id", insight.id);
          processed++;
        } catch (error) {
          console.error(`Error processing insight ${insight.id}:`, error);
          errors++;
        }
      }

      return NextResponse.json<ApiResponse>({
        success: true,
        data: {
          processed,
          errors,
          total: insights.length,
        },
      });
    }
  } catch (error) {
    console.error("Error generating embeddings:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate embeddings",
      },
      { status: 500 }
    );
  }
}

