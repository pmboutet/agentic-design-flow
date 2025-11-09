/**
 * Quarantine management library
 * Functions to quarantine and release user profiles
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface QuarantinedProfile {
  id: string;
  email: string;
  fullName?: string | null;
  isQuarantined: boolean;
  quarantinedAt?: string | null;
  quarantinedReason?: string | null;
}

/**
 * Quarantine a profile
 * Uses the database function quarantine_profile
 */
export async function quarantineProfile(
  supabase: SupabaseClient,
  profileId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc('quarantine_profile', {
    profile_id: profileId,
    reason: reason,
  });

  if (error) {
    throw new Error(`Failed to quarantine profile: ${error.message}`);
  }
}

/**
 * Release a profile from quarantine
 * Uses the database function release_profile_from_quarantine
 */
export async function releaseProfileFromQuarantine(
  supabase: SupabaseClient,
  profileId: string
): Promise<void> {
  const { error } = await supabase.rpc('release_profile_from_quarantine', {
    profile_id: profileId,
  });

  if (error) {
    throw new Error(`Failed to release profile from quarantine: ${error.message}`);
  }
}

/**
 * Check if a profile is quarantined
 */
export async function isProfileQuarantined(
  supabase: SupabaseClient,
  profileId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_quarantined')
    .eq('id', profileId)
    .single();

  if (error) {
    throw new Error(`Failed to check quarantine status: ${error.message}`);
  }

  return data?.is_quarantined ?? false;
}

/**
 * Get quarantined profile details
 */
export async function getQuarantinedProfile(
  supabase: SupabaseClient,
  profileId: string
): Promise<QuarantinedProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_quarantined, quarantined_at, quarantined_reason')
    .eq('id', profileId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Profile not found
    }
    throw new Error(`Failed to get quarantined profile: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    isQuarantined: data.is_quarantined ?? false,
    quarantinedAt: data.quarantined_at,
    quarantinedReason: data.quarantined_reason,
  };
}

/**
 * List all quarantined profiles
 */
export async function listQuarantinedProfiles(
  supabase: SupabaseClient,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<QuarantinedProfile[]> {
  let query = supabase
    .from('profiles')
    .select('id, email, full_name, is_quarantined, quarantined_at, quarantined_reason')
    .eq('is_quarantined', true)
    .order('quarantined_at', { ascending: false });

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 100) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list quarantined profiles: ${error.message}`);
  }

  return (data ?? []).map((profile) => ({
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    isQuarantined: profile.is_quarantined ?? false,
    quarantinedAt: profile.quarantined_at,
    quarantinedReason: profile.quarantined_reason,
  }));
}

