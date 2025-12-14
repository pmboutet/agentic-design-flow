import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Clear the cached admin client (useful for debugging or after config changes)
 */
export function clearAdminClientCache(): void {
  cachedClient = null;
}

export function getAdminSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured");
  }

  if (!serviceRoleKey) {
    throw new Error("Supabase service role key is required for admin operations");
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        "X-Client-Info": "agentic-admin-backoffice",
        "X-Client-Role": "service"
      }
    }
  });

  return cachedClient;
}
