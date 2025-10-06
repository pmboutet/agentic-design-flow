import { NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ChallengeRecord } from "@/types";

function mapChallenge(row: any): ChallengeRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    projectId: row.project_id,
    projectName: row.projects?.name ?? null,
    parentChallengeId: row.parent_challenge_id ?? null,
    assignedTo: row.assigned_to,
    dueDate: row.due_date,
    updatedAt: row.updated_at,
    systemPrompt: row.system_prompt ?? null
  };
}

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from("challenges")
      .select("*, projects(name)")
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json<ApiResponse<ChallengeRecord[]>>({
      success: true,
      data: (data ?? []).map(mapChallenge)
    });
  } catch (error) {
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
