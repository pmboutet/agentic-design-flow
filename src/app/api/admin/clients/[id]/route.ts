import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ClientRecord } from "@/types";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  company: z.string().trim().max(255).optional().or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).optional()
});

function mapClient(row: any): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    email: row.email,
    company: row.company,
    industry: row.industry,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    const resolvedParams = await params;
    const clientId = z.string().uuid().parse(resolvedParams.id);
    const { error } = await supabase.from("clients").delete().eq("id", clientId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse>({ success: true });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    else if (error instanceof Error && error.message.includes('required')) status = 403;
    
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid client id" : parseErrorMessage(error)
    }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    const resolvedParams = await params;
    const clientId = z.string().uuid().parse(resolvedParams.id);
    const body = await request.json();
    const payload = updateSchema.parse(body);

    const updateData: Record<string, any> = {};
    if (payload.name !== undefined) updateData.name = sanitizeText(payload.name);
    if (payload.email !== undefined) updateData.email = sanitizeOptional(payload.email || null);
    if (payload.company !== undefined) updateData.company = sanitizeOptional(payload.company || null);
    if (payload.industry !== undefined) updateData.industry = sanitizeOptional(payload.industry || null);
    if (payload.status !== undefined) updateData.status = payload.status;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "No valid fields provided"
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("clients")
      .update(updateData)
      .eq("id", clientId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ClientRecord>>({
      success: true,
      data: mapClient(data)
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    else if (error instanceof Error && error.message.includes('required')) status = 403;
    
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}
