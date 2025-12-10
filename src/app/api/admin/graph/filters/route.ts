import { NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import type { ApiResponse } from "@/types";

interface FilterOption {
  id: string;
  name: string;
  parentId?: string | null;
}

interface FiltersResponse {
  clients: FilterOption[];
  projects: FilterOption[];
  challenges: FilterOption[];
}

export async function GET() {
  const supabase = getAdminSupabaseClient();

  try {
    // Fetch all data in parallel for efficiency
    const [clientsResult, projectsResult, challengesResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("projects")
        .select("id, name, client_id")
        .order("name"),
      supabase
        .from("challenges")
        .select("id, name, project_id, parent_challenge_id")
        .order("name"),
    ]);

    if (clientsResult.error) throw clientsResult.error;
    if (projectsResult.error) throw projectsResult.error;
    if (challengesResult.error) throw challengesResult.error;

    const clients: FilterOption[] = (clientsResult.data || []).map((c) => ({
      id: c.id,
      name: c.name,
    }));

    const projects: FilterOption[] = (projectsResult.data || []).map((p) => ({
      id: p.id,
      name: p.name,
      parentId: p.client_id,
    }));

    const challenges: FilterOption[] = (challengesResult.data || []).map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.project_id,
    }));

    return NextResponse.json<ApiResponse<FiltersResponse>>({
      success: true,
      data: {
        clients,
        projects,
        challenges,
      },
    });
  } catch (error) {
    console.error("Error fetching graph filters:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
