import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser client for Supabase with authentication support.
 * Use this client in client-side components and pages.
 * 
 * For server-side operations and admin tasks, use getAdminSupabaseClient() from supabaseAdmin.ts
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Export a singleton instance for convenience
export const supabase = createClient()

