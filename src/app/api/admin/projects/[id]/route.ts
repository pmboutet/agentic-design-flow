import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ProjectRecord } from "@/types";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";

const statusValues = ["active", "paused", "completed", "archived"] as const;
const dateSchema = z.string().trim().min(1).refine(value => !Number.isNaN(new Date(value).getTime()), {
  message: "Invalid date format"
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  clientId: z.string().uuid().optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  status: z.enum(statusValues).optional(),
  createdBy: z.string().uuid().optional().or(z.literal("")),
  systemPrompt: z.string().trim().max(8000).optional().or(z.literal(""))
});

function mapProject(row: any): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    clientId: row.client_id,
    clientName: row.clients?.name ?? null,
    startDate: row.start_date,
    endDate: row.end_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    systemPrompt: row.system_prompt ?? null
  };
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    
    const projectId = z.string().uuid().parse(params.id);
    const { error } = await supabase.from("projects").delete().eq("id", projectId);

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
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid project id" : parseErrorMessage(error)
    }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const supabase = await createServerSupabaseClient();
    
    const projectId = z.string().uuid().parse(params.id);
    const body = await request.json();
    const payload = updateSchema.parse(body);

    const updateData: Record<string, any> = {};
    if (payload.name !== undefined) updateData.name = sanitizeText(payload.name);
    if (payload.description !== undefined) updateData.description = sanitizeOptional(payload.description || null);
    if (payload.status !== undefined) updateData.status = payload.status;
    if (payload.clientId !== undefined) updateData.client_id = payload.clientId;
    if (payload.createdBy !== undefined) {
      updateData.created_by = payload.createdBy && payload.createdBy !== "" ? payload.createdBy : null;
    }
    if (payload.systemPrompt !== undefined) {
      updateData.system_prompt = sanitizeOptional(payload.systemPrompt || null);
    }
    if (payload.startDate !== undefined) {
      const startDate = new Date(payload.startDate);
      if (Number.isNaN(startDate.getTime())) {
        throw new z.ZodError([{ message: "Invalid start date", path: ["startDate"], code: "custom" }]);
      }
      updateData.start_date = startDate.toISOString();
    }
    if (payload.endDate !== undefined) {
      const endDate = new Date(payload.endDate);
      if (Number.isNaN(endDate.getTime())) {
        throw new z.ZodError([{ message: "Invalid end date", path: ["endDate"], code: "custom" }]);
      }
      updateData.end_date = endDate.toISOString();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "No valid fields provided"
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("projects")
      .update(updateData)
      .eq("id", projectId)
      .select("*, clients(name)")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ProjectRecord>>({
      success: true,
      data: mapProject(data)
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
