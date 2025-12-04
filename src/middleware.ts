import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Skip auth/session checks entirely in development when IS_DEV=true
  if (process.env.IS_DEV === 'true') {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Allow /auth/callback to process the OAuth flow without redirecting
  if (request.nextUrl.pathname === '/auth/callback') {
    return response
  }

  // First, call getSession() which can refresh tokens if needed
  // This also updates cookies with refreshed tokens
  const { data: { session } } = await supabase.auth.getSession()

  // For protected routes, we need to verify the user is actually authenticated
  // getSession() just reads cookies, getUser() validates with Supabase
  let isAuthenticated = false

  if (session) {
    // Session exists in cookies, try to validate it
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    isAuthenticated = !userError && !!user

    // If validation failed but we have a session, the token might be refreshing
    // Let the request through - the client will handle token refresh
    if (!isAuthenticated && session.refresh_token) {
      // Has refresh token, let client-side handle the refresh
      isAuthenticated = true
    }
  }

  // Protect admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!isAuthenticated) {
      const redirectUrl = new URL('/auth/login', request.url)
      const redirectPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
      redirectUrl.searchParams.set('redirectTo', redirectPath)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Redirect logged-in users away from auth pages (except callback)
  if (request.nextUrl.pathname.startsWith('/auth/') && request.nextUrl.pathname !== '/auth/callback') {
    if (isAuthenticated) {
      // Get the redirectTo param if it exists, otherwise go to /admin
      const redirectTo = request.nextUrl.searchParams.get('redirectTo') || '/admin'
      return NextResponse.redirect(new URL(redirectTo, request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
