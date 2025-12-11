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
  systemPrompt: z.string().trim().max(8000).optional().or(z.literal("")),
  graphRagScope: z.enum(["project", "client"]).optional(),
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
    systemPrompt: row.system_prompt ?? null,
    graphRagScope: row.graph_rag_scope ?? "project",
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
    const projectId = z.string().uuid().parse(resolvedParams.id);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile } = await requireAdmin();
    const supabase = await createServerSupabaseClient();
    const resolvedParams = await params;
    const projectId = z.string().uuid().parse(resolvedParams.id);
    const body = await request.json();
    const payload = updateSchema.parse(body);

    const role = profile.role?.toLowerCase() ?? "";

    // If changing clientId, verify permissions
    if (payload.clientId !== undefined) {
      // First, get the current project to check if client is actually changing
      const { data: currentProject, error: projectError } = await supabase
        .from("projects")
        .select("client_id")
        .eq("id", projectId)
        .single();

      if (projectError || !currentProject) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Project not found"
        }, { status: 404 });
      }

      // Check if client is actually changing
      if (payload.clientId !== currentProject.client_id) {
        // Only full_admin can change a project to any client
        if (role !== "full_admin") {
          // Non full_admin users can only move projects within their own client
          // Since they can only see their own client, they can't really change client
          // Unless we allow moving between clients they have access to
          if (profile.client_id !== payload.clientId) {
            return NextResponse.json<ApiResponse>({
              success: false,
              error: "Vous ne pouvez transférer un projet que vers votre propre organisation"
            }, { status: 403 });
          }
          // Also check they have access to the source project
          if (profile.client_id !== currentProject.client_id) {
            return NextResponse.json<ApiResponse>({
              success: false,
              error: "Vous n'avez pas accès à ce projet"
            }, { status: 403 });
          }
        }
        // Verify the target client exists
        const { data: targetClient, error: clientError } = await supabase
          .from("clients")
          .select("id")
          .eq("id", payload.clientId)
          .single();

        if (clientError || !targetClient) {
          return NextResponse.json<ApiResponse>({
            success: false,
            error: "Le client cible n'existe pas"
          }, { status: 400 });
        }
      }
    }

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
    if (payload.graphRagScope !== undefined) {
      // Verify permissions for client-level scope (requires full_admin or client_admin)
      if (payload.graphRagScope === "client") {
        // requireAdmin already checked, but verify role explicitly
        if (!profile || (profile.role !== "client_admin" && profile.role !== "full_admin")) {
          return NextResponse.json<ApiResponse>({
            success: false,
            error: "Client-level Graph RAG scope requires admin permissions"
          }, { status: 403 });
        }
      }
      updateData.graph_rag_scope = payload.graphRagScope;
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
