import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse } from "@/types";

const payloadSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
  role: z.string().trim().max(50).optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = z.string().uuid("Invalid project id").parse(params.id);
    const body = await request.json();
    const payload = payloadSchema.parse(body);

    const supabase = getAdminSupabaseClient();

    const { error } = await supabase
      .from("project_members")
      .upsert(
        {
          project_id: projectId,
          user_id: payload.userId,
          role: payload.role ?? "member"
        },
        { onConflict: "project_id,user_id" }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null
    }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}
