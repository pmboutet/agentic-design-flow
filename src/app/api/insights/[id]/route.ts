import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse } from "@/types";

const updateSchema = z.object({
  content: z.string().trim().min(1).max(10000),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const resolvedParams = await params;
    const insightId = z.string().uuid().parse(resolvedParams.id);
    const body = await request.json();

    const payload = updateSchema.parse(body);

    const { data, error } = await supabase
      .from("insights")
      .update({
        content: sanitizeText(payload.content),
        updated_at: new Date().toISOString(),
      })
      .eq("id", insightId)
      .select("id, content, updated_at")
      .single();

    if (error) {
      console.error("Failed to update insight:", error);
      throw error;
    }

    return NextResponse.json<ApiResponse<{ id: string; content: string; updatedAt: string }>>({
      success: true,
      data: {
        id: data.id,
        content: data.content,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    console.error("Insight update error:", error);
    let status = 500;
    if (error instanceof z.ZodError) status = 400;

    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          error instanceof z.ZodError
            ? error.errors[0]?.message || "Invalid payload"
            : parseErrorMessage(error),
      },
      { status }
    );
  }
}
