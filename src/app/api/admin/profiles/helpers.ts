import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientMembership, ManagedUser, ProjectMembership, ClientRole } from "@/types";
import { safeQuery, safeQueryNoThrow, addDbBreadcrumb } from "@/lib/supabaseQuery";

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
  addDbBreadcrumb("Fetching project memberships", { userIds });

  // Build the query with optional user filter
  let query = supabase
    .from("project_members")
    .select("project_id, user_id")
    .order("created_at", { ascending: true });

  if (userIds && userIds.length > 0) {
    query = query.in("user_id", userIds);
  }

  const data = await safeQuery<{ project_id: string; user_id: string }[]>(
    () => query,
    {
      table: "project_members",
      operation: "select",
      filters: userIds ? { user_ids: userIds } : undefined,
      description: "Fetch project memberships for users",
    }
  );

  const map = new Map<string, string[]>();
  (data ?? []).forEach(row => {
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

/**
 * Add a user to a client (upsert - won't fail if already exists)
 * @returns true if a new membership was created, false if already existed
 */
export async function ensureClientMembership(
  supabase: SupabaseClient,
  clientId: string,
  userId: string,
  role: ClientRole = "participant"
): Promise<boolean> {
  // Check if already exists
  const { data: existing } = await supabase
    .from("client_members")
    .select("id")
    .eq("client_id", clientId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return false;
  }

  const { error } = await supabase
    .from("client_members")
    .insert({
      client_id: clientId,
      user_id: userId,
      role,
    });

  if (error) {
    console.error("Error adding client member:", error);
    return false;
  }

  return true;
}

/**
 * Add a user to a project (upsert - won't fail if already exists)
 * @returns true if a new membership was created, false if already existed
 */
export async function ensureProjectMembership(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<boolean> {
  // Check if already exists
  const { data: existing } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return false;
  }

  const { error } = await supabase
    .from("project_members")
    .insert({
      project_id: projectId,
      user_id: userId,
    });

  if (error) {
    console.error("Error adding project member:", error);
    return false;
  }

  return true;
}

export interface CreateUserData {
  email: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
}

export interface GetOrCreateUserResult {
  userId: string;
  userCreated: boolean;
}

/**
 * Get an existing user by ID or create a new user from the provided data.
 * If createUser.email already exists, returns that existing user instead of creating a duplicate.
 *
 * @param supabase - Supabase client
 * @param userId - Optional existing user ID to find
 * @param createUser - Optional data to create a new user
 * @returns The user ID and whether a new user was created
 * @throws Error if neither userId nor createUser is provided, or if user is not found
 */
export async function getOrCreateUser(
  supabase: SupabaseClient,
  userId?: string,
  createUser?: CreateUserData
): Promise<GetOrCreateUserResult> {
  // Import sanitize functions inline to avoid circular dependencies
  const { sanitizeOptional, sanitizeText } = await import("@/lib/sanitize");

  if (userId) {
    // Existing user mode - verify user exists
    addDbBreadcrumb("Verifying user exists", { userId });

    const existingUser = await safeQuery<{ id: string }>(
      () => supabase.from("profiles").select("id").eq("id", userId).single(),
      {
        table: "profiles",
        operation: "select",
        expectData: true,
        filters: { id: userId },
        description: "Verify user exists by ID",
      }
    );

    if (!existingUser) {
      throw new Error("User not found");
    }

    return { userId, userCreated: false };
  }

  if (createUser) {
    const { email, firstName, lastName, jobTitle } = createUser;

    // Check if email already exists
    const { data: existingByEmail } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingByEmail) {
      // User already exists with this email - block creation
      throw new Error("Un utilisateur avec cet email existe déjà");
    }

    // Create new profile
    const insertData: Record<string, unknown> = {
      email: sanitizeText(email.toLowerCase()),
      role: "participant",
      is_active: true,
    };

    if (firstName) {
      insertData.first_name = sanitizeOptional(firstName);
    }
    if (lastName) {
      insertData.last_name = sanitizeOptional(lastName);
    }
    if (firstName || lastName) {
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      if (fullName) {
        insertData.full_name = sanitizeOptional(fullName);
      }
    }
    if (jobTitle) {
      insertData.job_title = sanitizeOptional(jobTitle);
    }

    const { data: newProfile, error: createError } = await supabase
      .from("profiles")
      .insert(insertData)
      .select("id")
      .single();

    if (createError) {
      throw createError;
    }

    return { userId: newProfile.id, userCreated: true };
  }

  throw new Error("Either userId or createUser must be provided");
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

