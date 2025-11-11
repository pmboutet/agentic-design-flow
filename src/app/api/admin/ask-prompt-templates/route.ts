import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type AskPromptTemplate } from "@/types";

const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  systemPrompt: z.string().trim().min(1, "System prompt is required"),
});

export async function GET(request: NextRequest) {
  try {
    // Verify user is admin
    await requireAdmin();
    // Use admin client to bypass RLS for admin operations
    const supabase = getAdminSupabaseClient();
    
    const { data, error } = await supabase
      .from("ask_prompt_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const templates: AskPromptTemplate[] = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      systemPrompt: row.system_prompt,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json<ApiResponse<AskPromptTemplate[]>>({
      success: true,
      data: templates,
    });
  } catch (error) {
    const status = error instanceof Error && error.message.includes('required') ? 401 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdmin();
    const adminSupabase = getAdminSupabaseClient();
    
    const body = await request.json();
    const payload = templateSchema.parse(body);

    // Get profile ID from auth user
    let profileId: string | null = null;
    if (user) {
      const { data: profileData } = await adminSupabase
        .from("profiles")
        .select("id")
        .eq("auth_id", user.id)
        .single();
      profileId = profileData?.id || null;
    }

    const insertData = {
      name: sanitizeText(payload.name),
      description: sanitizeOptional(payload.description || null),
      system_prompt: sanitizeText(payload.systemPrompt),
      created_by: profileId,
    };

    const { data, error } = await adminSupabase
      .from("ask_prompt_templates")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
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
    }, { status: 201 });
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

