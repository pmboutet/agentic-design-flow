import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getAdminSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured");
  }

  const resolvedKey = serviceRoleKey ?? anonKey;

  if (!resolvedKey) {
    throw new Error("No Supabase credentials are configured");
  }

  cachedClient = createClient(supabaseUrl, resolvedKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        "X-Client-Info": "agentic-admin-backoffice",
        ...(serviceRoleKey ? { "X-Client-Role": "service" } : { "X-Client-Role": "anon" })
      }
    }
  });

  return cachedClient;
}
