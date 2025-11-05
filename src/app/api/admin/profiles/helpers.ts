import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagedUser } from "@/types";

type MembershipRow = {
  project_id: string;
  user_id: string;
};

export async function fetchProjectMemberships(
  supabase: SupabaseClient,
  userIds?: string[]
): Promise<Map<string, string[]>> {
  let query = supabase
    .from("project_members")
    .select("project_id, user_id")
    .order("created_at", { ascending: true });

  if (userIds && userIds.length > 0) {
    query = query.in("user_id", userIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const map = new Map<string, string[]>();
  (data as MembershipRow[] | null | undefined)?.forEach(row => {
    if (!row?.user_id || !row?.project_id) {
      return;
    }
    const entries = map.get(row.user_id) ?? [];
    entries.push(row.project_id);
    map.set(row.user_id, entries);
  });

  return map;
}

export function mapManagedUser(
  row: any,
  membershipMap?: Map<string, string[]>
): ManagedUser {
  const projectIds = [...(membershipMap?.get(row.id) ?? [])];
  projectIds.sort();

  return {
    id: row.id,
    authId: row.auth_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name,
    role: row.role,
    clientId: row.client_id,
    clientName: row.clients?.name ?? null,
    avatarUrl: row.avatar_url,
    projectIds,
    isActive: row.is_active,
    lastLogin: row.last_login,
    jobTitle: row.job_title ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

