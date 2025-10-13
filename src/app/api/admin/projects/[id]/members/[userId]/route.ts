import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse } from "@/types";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const projectId = z.string().uuid("Invalid project id").parse(params.id);
    const userId = z.string().uuid("Invalid user id").parse(params.userId);

    const supabase = getAdminSupabaseClient();
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid parameters" : parseErrorMessage(error)
    }, { status });
  }
}
