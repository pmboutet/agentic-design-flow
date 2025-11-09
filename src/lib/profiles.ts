import { getAdminSupabaseClient } from "./supabaseAdmin";
import { createServerSupabaseClient } from "./supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures a profile exists for the given email address.
 * If the profile doesn't exist, creates an auth user and profile.
 * If the profile exists but has no auth_id, creates an auth user and links it.
 * 
 * @param email - Email address to check/create
 * @param projectId - Project ID to add user to if not already a member
 * @returns Profile ID
 */
export async function ensureProfileExists(
  email: string,
  projectId: string
): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();
  const adminSupabase = getAdminSupabaseClient();
  const supabase = await createServerSupabaseClient();

  // Check if profile exists
  const { data: existingProfile, error: checkError } = await supabase
    .from("profiles")
    .select("id, auth_id, email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Failed to check existing profile: ${checkError.message}`);
  }

  let profileId: string;
  let authId: string | null = null;

  if (existingProfile) {
    profileId = existingProfile.id;
    authId = existingProfile.auth_id;

    // If profile exists but no auth_id, create auth user
    if (!authId) {
      const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          email: normalizedEmail,
        },
      });

      if (authError) {
        throw new Error(`Failed to create auth user: ${authError.message}`);
      }

      authId = authData.user.id;

      // Update profile with auth_id
      const { error: updateError } = await adminSupabase
        .from("profiles")
        .update({ auth_id: authId })
        .eq("id", profileId);

      if (updateError) {
        throw new Error(`Failed to link auth user to profile: ${updateError.message}`);
      }
    }
  } else {
    // Create new auth user (passwordless)
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        email: normalizedEmail,
      },
    });

    if (authError) {
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    authId = authData.user.id;

    // Profile should be created by trigger, but wait a bit and check
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if profile was created by trigger
    const { data: triggerProfile, error: triggerError } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_id", authId)
      .maybeSingle();

    if (triggerError) {
      throw new Error(`Failed to check trigger-created profile: ${triggerError.message}`);
    }

    if (triggerProfile) {
      profileId = triggerProfile.id;
    } else {
      // Fallback: create profile manually if trigger didn't fire
      const { data: newProfile, error: profileError } = await adminSupabase
        .from("profiles")
        .insert({
          auth_id: authId,
          email: normalizedEmail,
          role: "participant",
          is_active: true,
        })
        .select("id")
        .single();

      if (profileError || !newProfile) {
        throw new Error(`Failed to create profile: ${profileError?.message || "Unknown error"}`);
      }

      profileId = newProfile.id;
    }
  }

  // Ensure user is added to project_members
  if (projectId) {
    const { data: existingMember, error: memberCheckError } = await adminSupabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", profileId)
      .maybeSingle();

    if (memberCheckError) {
      console.warn(`Failed to check project membership: ${memberCheckError.message}`);
    } else if (!existingMember) {
      // Add user to project
      const { error: addMemberError } = await adminSupabase
        .from("project_members")
        .insert({
          project_id: projectId,
          user_id: profileId,
          role: "member",
        });

      if (addMemberError) {
        console.warn(`Failed to add user to project: ${addMemberError.message}`);
        // Don't throw - this is not critical for the magic link flow
      }
    }
  }

  return profileId;
}


