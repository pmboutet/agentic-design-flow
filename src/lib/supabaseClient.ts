import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser client for Supabase with authentication support.
 * Use this client in client-side components and pages.
 * 
 * For server-side operations and admin tasks, use getAdminSupabaseClient() from supabaseAdmin.ts
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Supabase configuration is missing:", {
      hasUrl: !!url,
      hasKey: !!key,
      url: url ? `${url.substring(0, 20)}...` : 'missing',
    });
    throw new Error("Supabase configuration is missing. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.");
  }

  return createBrowserClient(url, key);
}

// Export a singleton instance for convenience
// Wrap in try-catch to handle missing configuration gracefully
let supabaseInstance: ReturnType<typeof createClient> | null = null;

try {
  supabaseInstance = createClient();
} catch (error) {
  console.error("Failed to create Supabase client:", error);
  // In production, we'll handle this gracefully in AuthProvider
}

export const supabase = supabaseInstance as ReturnType<typeof createClient>;

