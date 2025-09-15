import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ProjectRecord } from "@/types";

const statusValues = ["active", "paused", "completed", "archived"] as const;
const dateSchema = z.string().trim().min(1).refine(value => !Number.isNaN(new Date(value).getTime()), {
  message: "Invalid date format"
});

const projectSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  clientId: z.string().uuid(),
  startDate: dateSchema,
  endDate: dateSchema,
  status: z.enum(statusValues).default("active"),
  createdBy: z.string().uuid().optional().or(z.literal(""))
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
    updatedAt: row.updated_at
  };
}

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from("projects")
      .select("*, clients(name)")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ProjectRecord[]>>({
      success: true,
      data: (data ?? []).map(mapProject)
    });
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
    const payload = projectSchema.parse(body);

    const supabase = getAdminSupabaseClient();
    const startDate = new Date(payload.startDate).toISOString();
    const endDate = new Date(payload.endDate).toISOString();

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: sanitizeText(payload.name),
        description: sanitizeOptional(payload.description || null),
        status: payload.status,
        client_id: payload.clientId,
        start_date: startDate,
        end_date: endDate,
        created_by: payload.createdBy && payload.createdBy !== "" ? payload.createdBy : null
      })
      .select("*, clients(name)")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ProjectRecord>>({
      success: true,
      data: mapProject(data)
    }, { status: 201 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message || "Invalid payload" : parseErrorMessage(error)
    }, { status });
  }
}
