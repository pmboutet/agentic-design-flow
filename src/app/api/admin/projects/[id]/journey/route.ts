import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import { fetchProjectJourneyContext } from "@/lib/projectJourneyLoader";
import { type ApiResponse, type ProjectJourneyBoardData } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function isResourceNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: string }).code;
  if (code === "PGRST116") {
    return true;
  }

  const status = (error as { status?: number }).status;
  if (status === 406) {
    return true;
  }

  const message = error instanceof Error ? error.message : undefined;
  if (message && message.toLowerCase().includes("project not found")) {
    return true;
  }

  return false;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const projectId = z.string().uuid().parse(params.id);

    const supabase = getAdminSupabaseClient();
    const { boardData } = await fetchProjectJourneyContext(supabase, projectId);

    return NextResponse.json<ApiResponse<ProjectJourneyBoardData>>({
      success: true,
      data: boardData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: error.errors[0]?.message || "Invalid project id",
      }, { status: 400 });
    }

    const status = isResourceNotFound(error) ? 404 : 500;
    const message = isResourceNotFound(error) ? "Project not found" : parseErrorMessage(error);

    return NextResponse.json<ApiResponse>({
      success: false,
      error: message,
    }, { status });
  }
}
