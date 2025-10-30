import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Creates a Supabase client for use in Server Components and Route Handlers.
 * This client respects RLS policies based on the authenticated user's JWT token.
 * 
 * Use this for user-initiated requests where RLS should be enforced.
 * For admin operations that need to bypass RLS, use getAdminSupabaseClient() instead.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  // In development, use service-role client to bypass RLS if available
  if (process.env.IS_DEV === 'true' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        global: {
          headers: {
            'X-Client-Info': 'agentic-dev-bypass',
            'X-Client-Role': 'service',
          },
        },
      }
    )
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * Helper to get the current user from the authenticated session.
 * Returns null if no user is authenticated.
 */
export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }
  
  return user
}

/**
 * Helper to verify the current user is an admin.
 * Throws an error if not authenticated or not an admin.
 */
export async function requireAdmin() {
  // In development, allow simulating an admin user when IS_DEV=true
  if (process.env.IS_DEV === 'true') {
    return {
      user: {
        id: 'dev-user',
        email: 'dev-admin@example.com',
      },
      profile: {
        role: 'full_admin',
        is_active: true,
      },
    }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    throw new Error('Authentication required')
  }
  
  // Check if user has admin role in profiles table
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('auth_id', user.id)
    .single()
  
  if (profileError || !profile) {
    throw new Error('Profile not found')
  }
  
  const isAdmin = ['admin', 'full_admin'].includes(profile.role)
  
  if (!isAdmin || !profile.is_active) {
    throw new Error('Admin access required')
  }
  
  return { user, profile }
}

