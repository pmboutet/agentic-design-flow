import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * OAuth callback route
 * Handles the redirect from OAuth providers (Google, GitHub, etc.)
 * Exchanges the code for a session and redirects to the app
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextParam = requestUrl.searchParams.get('next')
  const redirectTo = requestUrl.searchParams.get('redirect_to') || nextParam
  const error_description = requestUrl.searchParams.get('error_description')

  // Extract askKey or token from redirect URL (format: /?key=ASK_KEY or /?token=TOKEN)
  let askKey: string | null = null
  let token: string | null = null
  if (redirectTo) {
    try {
      const redirectUrl = new URL(redirectTo, requestUrl.origin)
      askKey = redirectUrl.searchParams.get('key')
      token = redirectUrl.searchParams.get('token')
    } catch {
      // If redirectTo is not a full URL, try parsing it as a path with query
      const keyMatch = redirectTo.match(/[?&]key=([^&]+)/)
      const tokenMatch = redirectTo.match(/[?&]token=([^&]+)/)
      if (keyMatch) {
        askKey = keyMatch[1]
      }
      if (tokenMatch) {
        token = tokenMatch[1]
      }
    }
  }

  // Handle OAuth errors
  if (error_description) {
    console.error('OAuth error:', error_description)
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error_description)}`, request.url)
    )
  }

  // Store cookies to be set on the response
  const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = []

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookies) {
            // Collect cookies to set on the redirect response
            cookies.forEach(({ name, value, options }) => {
              cookiesToSet.push({ name, value, options: options || {} })
            })
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

  // Helper function to create redirect with cookies
  const createRedirectWithCookies = (url: URL) => {
    const response = NextResponse.redirect(url)
    // Set all cookies collected during session exchange
    cookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
    })
    return response
  }

  // Priority: If token is present, redirect to ask session page with token
  if (token) {
    return createRedirectWithCookies(new URL(`/?token=${token}`, requestUrl.origin))
  }

  // Priority: If askKey is present, redirect to ask session page
  if (askKey) {
    return createRedirectWithCookies(new URL(`/?key=${askKey}`, requestUrl.origin))
  }

  const fallbackDestination = '/admin'

  const safeNext = (() => {
    if (!nextParam) {
      return fallbackDestination
    }

    try {
      const candidateUrl = new URL(nextParam, requestUrl.origin)

      if (candidateUrl.origin !== requestUrl.origin) {
        return fallbackDestination
      }

      const normalizedDestination = `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}`

      if (normalizedDestination === '' || normalizedDestination === '/') {
        return fallbackDestination
      }

      return normalizedDestination
    } catch {
      return fallbackDestination
    }
  })()

  // Redirect to the intended destination (default: admin) with cookies
  return createRedirectWithCookies(new URL(safeNext, requestUrl.origin))
}

