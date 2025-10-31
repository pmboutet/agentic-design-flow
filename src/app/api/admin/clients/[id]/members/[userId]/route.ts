import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ClientMember } from "@/types";

const updateSchema = z.object({
  jobTitle: z.string().trim().max(255).optional().or(z.literal(""))
});

function mapClientMember(row: any): ClientMember {
  return {
    id: row.id,
    clientId: row.client_id,
    userId: row.user_id,
    jobTitle: row.job_title ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const clientId = z.string().uuid("Invalid client id").parse(params.id);
    const userId = z.string().uuid("Invalid user id").parse(params.userId);
    const body = await request.json();
    const payload = updateSchema.parse(body);

    const supabase = getAdminSupabaseClient();

    const updateData: Record<string, unknown> = {};
    if (payload.jobTitle !== undefined) {
      updateData.job_title = sanitizeOptional(payload.jobTitle || null);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "No valid fields provided"
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("client_members")
      .update(updateData)
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ClientMember>>({
      success: true,
      data: mapClientMember(data)
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid parameters" : parseErrorMessage(error)
    }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const clientId = z.string().uuid("Invalid client id").parse(params.id);
    const userId = z.string().uuid("Invalid user id").parse(params.userId);

    const supabase = getAdminSupabaseClient();
    const { error } = await supabase
      .from("client_members")
      .delete()
      .eq("client_id", clientId)
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

