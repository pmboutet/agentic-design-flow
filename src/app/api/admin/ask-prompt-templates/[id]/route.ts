import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabaseServer";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type AskPromptTemplate } from "@/types";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255).optional(),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  systemPrompt: z.string().trim().min(1, "System prompt is required").optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = getAdminSupabaseClient();
    const resolvedParams = await params;
    const templateId = z.string().uuid().parse(resolvedParams.id);

    const { data, error } = await supabase
      .from("ask_prompt_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Template not found",
        }, { status: 404 });
      }
      throw error;
    }

    if (!data) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Template not found",
      }, { status: 404 });
    }

    const template: AskPromptTemplate = {
      id: data.id,
      name: data.name,
      description: data.description,
      systemPrompt: data.system_prompt,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json<ApiResponse<AskPromptTemplate>>({
      success: true,
      data: template,
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid template id" : parseErrorMessage(error),
    }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = getAdminSupabaseClient();
    const resolvedParams = await params;
    const templateId = z.string().uuid().parse(resolvedParams.id);
    const body = await request.json();
    const payload = updateSchema.parse(body);

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.name !== undefined) {
      updateData.name = sanitizeText(payload.name);
    }
    if (payload.description !== undefined) {
      updateData.description = sanitizeOptional(payload.description);
    }
    if (payload.systemPrompt !== undefined) {
      updateData.system_prompt = sanitizeText(payload.systemPrompt);
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "No valid fields provided",
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("ask_prompt_templates")
      .update(updateData)
      .eq("id", templateId)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Template not found",
        }, { status: 404 });
      }
      throw error;
    }

    const template: AskPromptTemplate = {
      id: data.id,
      name: data.name,
      description: data.description,
      systemPrompt: data.system_prompt,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json<ApiResponse<AskPromptTemplate>>({
      success: true,
      data: template,
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    else if (error instanceof Error && error.message.includes('required')) status = 403;
    
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error),
    }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = getAdminSupabaseClient();
    const resolvedParams = await params;
    const templateId = z.string().uuid().parse(resolvedParams.id);

    const { error } = await supabase
      .from("ask_prompt_templates")
      .delete()
      .eq("id", templateId);

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse>({
      success: true,
    });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) status = 400;
    else if (error instanceof Error && error.message.includes('required')) status = 403;
    
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid template id" : parseErrorMessage(error),
    }, { status });
  }
}

