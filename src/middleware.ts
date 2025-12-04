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

  // Use getUser() instead of getSession() to properly validate the JWT
  // getSession() only reads cookies without validation, causing inconsistent results
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  // Check if user is authenticated (valid JWT)
  const isAuthenticated = !userError && !!user

  // Allow /auth/callback to process the OAuth flow without redirecting
  if (request.nextUrl.pathname === '/auth/callback') {
    return response
  }

  // Protect admin routes - only redirect if definitely not authenticated
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!isAuthenticated) {
      // Check for redirect loop protection - don't redirect if coming from login
      const referer = request.headers.get('referer')
      const isFromLogin = referer?.includes('/auth/login')

      if (isFromLogin) {
        // If coming from login, let the page render (client-side will handle)
        // This prevents infinite redirect loops
        return response
      }

      const redirectUrl = new URL('/auth/login', request.url)
      const redirectPath = `${request.nextUrl.pathname}${request.nextUrl.search}`
      redirectUrl.searchParams.set('redirectTo', redirectPath)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Redirect logged-in users away from auth pages (except callback)
  if (request.nextUrl.pathname.startsWith('/auth/') && request.nextUrl.pathname !== '/auth/callback') {
    if (isAuthenticated) {
      // Check for redirect loop protection - don't redirect if coming from admin
      const referer = request.headers.get('referer')
      const isFromAdmin = referer?.includes('/admin')

      if (isFromAdmin) {
        // If coming from admin, let the page render (prevents loop)
        return response
      }

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
