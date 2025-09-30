import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse } from "@/types";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = z.string().uuid().parse(params.id);

    const supabase = getAdminSupabaseClient();
    const { error } = await supabase.from("projects").delete().eq("id", projectId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse>({ success: true });
  } catch (error) {
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid project id" : parseErrorMessage(error)
    }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
