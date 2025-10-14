import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
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

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
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

