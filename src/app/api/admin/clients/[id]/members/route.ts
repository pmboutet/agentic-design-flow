import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ClientMember } from "@/types";

const payloadSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = z.string().uuid("Invalid client id").parse(params.id);
    const supabase = getAdminSupabaseClient();

    const { data, error } = await supabase
      .from("client_members")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ClientMember[]>>({
      success: true,
      data: (data ?? []).map(mapClientMember)
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid parameters" : parseErrorMessage(error)
    }, { status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = z.string().uuid("Invalid client id").parse(params.id);
    const body = await request.json();
    const payload = payloadSchema.parse(body);

    const supabase = getAdminSupabaseClient();
    const jobTitle = payload.jobTitle ? sanitizeOptional(payload.jobTitle || null) : undefined;

    const upsertData: Record<string, unknown> = {
      client_id: clientId,
      user_id: payload.userId
    };

    if (jobTitle !== undefined) {
      upsertData.job_title = jobTitle;
    }

    const { data, error } = await supabase
      .from("client_members")
      .upsert(upsertData, { onConflict: "client_id,user_id" })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ClientMember>>({
      success: true,
      data: mapClientMember(data)
    }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}

