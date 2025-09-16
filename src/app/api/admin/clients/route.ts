import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ClientRecord } from "@/types";

const clientSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  company: z.string().trim().max(255).optional().or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active")
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

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const clients = (data ?? []).map(mapClient);
    return NextResponse.json<ApiResponse<ClientRecord[]>>({ success: true, data: clients });
  } catch (error) {
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = clientSchema.parse(body);

    const supabase = getAdminSupabaseClient();
    const newClient = {
      name: sanitizeText(payload.name),
      status: payload.status,
      email: sanitizeOptional(payload.email || null),
      company: sanitizeOptional(payload.company || null),
      industry: sanitizeOptional(payload.industry || null)
    };

    const { data, error } = await supabase
      .from("clients")
      .insert(newClient)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ClientRecord>>({
      success: true,
      data: mapClient(data)
    }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}
