import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientMembership, ManagedUser, ProjectMembership, ClientRole } from "@/types";

type ProjectMembershipRow = {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  job_title?: string | null;
  created_at: string;
  projects?: {
    id: string;
    name: string;
    status: string;
    client_id: string;
    clients?: {
      id: string;
      name: string;
    } | {
      id: string;
      name: string;
    }[];
  } | {
    id: string;
    name: string;
    status: string;
    client_id: string;
    clients?: {
      id: string;
      name: string;
    } | {
      id: string;
      name: string;
    }[];
  }[];
};

type ClientMembershipRow = {
  id: string;
  client_id: string;
  user_id: string;
  role: string;
  job_title?: string | null;
  created_at: string;
  updated_at: string;
  clients?: {
    id: string;
    name: string;
    status: string;
  } | {
    id: string;
    name: string;
    status: string;
  }[];
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
  (data as { project_id: string; user_id: string }[] | null | undefined)?.forEach(row => {
    if (!row?.user_id || !row?.project_id) {
      return;
    }
    const entries = map.get(row.user_id) ?? [];
    entries.push(row.project_id);
    map.set(row.user_id, entries);
  });

  return map;
}

export async function fetchClientMemberships(
  supabase: SupabaseClient,
  userIds?: string[]
): Promise<Map<string, ClientMembership[]>> {
  let query = supabase
    .from("client_members")
    .select(`
      id,
      client_id,
      user_id,
      role,
      job_title,
      created_at,
      updated_at,
      clients:client_id (
        id,
        name,
        status
      )
    `)
    .order("created_at", { ascending: false });

  if (userIds && userIds.length > 0) {
    query = query.in("user_id", userIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const map = new Map<string, ClientMembership[]>();
  (data as ClientMembershipRow[] | null | undefined)?.forEach(row => {
    if (!row?.user_id || !row?.client_id) {
      return;
    }
    // Supabase can return joined data as array or object depending on query
    const clientData = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    const membership: ClientMembership = {
      id: row.id,
      clientId: row.client_id,
      userId: row.user_id,
      role: (row.role || 'participant') as ClientRole,
      jobTitle: row.job_title ?? null,
      clientName: clientData?.name ?? 'Unknown',
      clientStatus: clientData?.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    const entries = map.get(row.user_id) ?? [];
    entries.push(membership);
    map.set(row.user_id, entries);
  });

  return map;
}

export async function fetchDetailedProjectMemberships(
  supabase: SupabaseClient,
  userIds?: string[]
): Promise<Map<string, ProjectMembership[]>> {
  let query = supabase
    .from("project_members")
    .select(`
      id,
      project_id,
      user_id,
      role,
      job_title,
      created_at,
      projects:project_id (
        id,
        name,
        status,
        client_id,
        clients:client_id (
          id,
          name
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (userIds && userIds.length > 0) {
    query = query.in("user_id", userIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const map = new Map<string, ProjectMembership[]>();
  (data as ProjectMembershipRow[] | null | undefined)?.forEach(row => {
    if (!row?.user_id || !row?.project_id || !row.projects) {
      return;
    }
    // Supabase can return joined data as array or object depending on query
    const projectData = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    if (!projectData) return;
    const clientData = projectData.clients ? (Array.isArray(projectData.clients) ? projectData.clients[0] : projectData.clients) : null;
    const membership: ProjectMembership = {
      id: row.id,
      projectId: row.project_id,
      projectName: projectData.name,
      projectStatus: projectData.status,
      clientId: projectData.client_id,
      clientName: clientData?.name,
      role: row.role || 'member',
      jobTitle: row.job_title ?? null,
      createdAt: row.created_at
    };
    const entries = map.get(row.user_id) ?? [];
    entries.push(membership);
    map.set(row.user_id, entries);
  });

  return map;
}

export function mapManagedUser(
  row: any,
  membershipMap?: Map<string, string[]>,
  clientMembershipMap?: Map<string, ClientMembership[]>,
  projectMembershipMap?: Map<string, ProjectMembership[]>
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
    avatarUrl: row.avatar_url,
    projectIds,
    clientMemberships: clientMembershipMap?.get(row.id) ?? [],
    projectMemberships: projectMembershipMap?.get(row.id) ?? [],
    isActive: row.is_active,
    lastLogin: row.last_login,
    jobTitle: row.job_title ?? null,
    description: row.description ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

