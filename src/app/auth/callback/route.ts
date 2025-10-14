import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * OAuth callback route
 * Handles the redirect from OAuth providers (Google, GitHub, etc.)
 * Exchanges the code for a session and redirects to the app
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/admin'
  const error_description = requestUrl.searchParams.get('error_description')

  // Handle OAuth errors
  if (error_description) {
    console.error('OAuth error:', error_description)
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error_description)}`, request.url)
    )
  }

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('OAuth callback error:', error)
      // Redirect to login with error
      return NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url)
      )
    }
  }

  // Redirect to the intended destination (default: admin)
  return NextResponse.redirect(new URL(next, request.url))
}

