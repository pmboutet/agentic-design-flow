import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";

/**
 * Centralized permission checks for member management operations.
 * These functions verify that a user has access to modify members of a project or client.
 */

export interface AdminProfile {
  role: string | null;
  is_active: boolean;
  client_ids: string[];  // User's client memberships from client_members table
}

/**
 * Check if a user can manage members of a project.
 * Rules:
 * - full_admin: can manage any project
 * - client_admin/facilitator/manager: can only manage projects belonging to their client
 */
export async function canManageProjectMembers(
  profile: AdminProfile,
  projectId: string
): Promise<{ allowed: boolean; error?: string; projectClientId?: string }> {
  const normalizedRole = profile.role?.toLowerCase() ?? "";

  // full_admin can manage any project
  if (normalizedRole === "full_admin") {
    return { allowed: true };
  }

  // Get the project's client_id to verify ownership
  const supabase = getAdminSupabaseClient();
  const { data: project, error } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return { allowed: false, error: "Project not found" };
  }

  // User must belong to the same client as the project
  if (!profile.client_ids.length || !profile.client_ids.includes(project.client_id)) {
    return {
      allowed: false,
      error: "You can only manage members of projects belonging to your organization"
    };
  }

  return { allowed: true, projectClientId: project.client_id };
}

/**
 * Check if a user can manage members of a client.
 * Rules:
 * - full_admin: can manage any client
 * - client_admin: can only manage their own client
 * - facilitator/manager: cannot manage client members
 */
export async function canManageClientMembers(
  profile: AdminProfile,
  clientId: string
): Promise<{ allowed: boolean; error?: string }> {
  const normalizedRole = profile.role?.toLowerCase() ?? "";

  // full_admin can manage any client
  if (normalizedRole === "full_admin") {
    return { allowed: true };
  }

  // Only client_admin and above can manage client members
  if (normalizedRole !== "client_admin") {
    return {
      allowed: false,
      error: "Only client admins can manage client members"
    };
  }

  // client_admin can only manage their own client
  if (!profile.client_ids.length || !profile.client_ids.includes(clientId)) {
    return {
      allowed: false,
      error: "You can only manage members of your own organization"
    };
  }

  return { allowed: true };
}

/**
 * Check if a user can view/manage ASK participants.
 * Rules:
 * - full_admin: can view any ASK
 * - client_admin/facilitator/manager: can only view ASKs belonging to their client's projects
 */
export async function canManageAskParticipants(
  profile: AdminProfile,
  askId: string
): Promise<{ allowed: boolean; error?: string }> {
  const normalizedRole = profile.role?.toLowerCase() ?? "";

  // full_admin can manage any ASK
  if (normalizedRole === "full_admin") {
    return { allowed: true };
  }

  // Get the ASK's project and verify client ownership
  const supabase = getAdminSupabaseClient();
  const { data: ask, error } = await supabase
    .from("ask_sessions")
    .select("project_id, projects!inner(client_id)")
    .eq("id", askId)
    .single();

  if (error || !ask) {
    return { allowed: false, error: "ASK session not found" };
  }

  // User must belong to the same client as the project
  const projectClientId = (ask.projects as any)?.client_id;
  if (!profile.client_ids.length || !profile.client_ids.includes(projectClientId)) {
    return {
      allowed: false,
      error: "You can only view participants of ASKs belonging to your organization"
    };
  }

  return { allowed: true };
}

/**
 * Check if a user can search users for a project.
 * Same rules as canManageProjectMembers.
 */
export const canSearchProjectUsers = canManageProjectMembers;
