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
    const clientId = z.string().uuid().parse(params.id);

    const supabase = getAdminSupabaseClient();
    const { error } = await supabase.from("clients").delete().eq("id", clientId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse>({ success: true });
  } catch (error) {
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid client id" : parseErrorMessage(error)
    }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
