import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * OAuth callback route
 * Handles the redirect from OAuth providers (Google, GitHub, etc.)
 * Exchanges the code for a session and redirects to the app
 */
export async function GET(request: NextRequest) {
  console.log('[Callback] ========== OAuth Callback Started ==========')

  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextParam = requestUrl.searchParams.get('next')
  const redirectTo = requestUrl.searchParams.get('redirect_to') || nextParam
  const error_description = requestUrl.searchParams.get('error_description')

  console.log(`[Callback] Params: code=${code ? 'exists' : 'none'}, next=${nextParam}, redirectTo=${redirectTo}, error=${error_description}`)

  // Log incoming cookies
  const allCookies = request.cookies.getAll()
  console.log(`[Callback] Incoming cookies: ${allCookies.length}`)
  allCookies.forEach(c => console.log(`[Callback] Cookie IN: ${c.name}`))

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
    console.log('[Callback] Exchanging code for session...')

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            const cookies = request.cookies.getAll()
            console.log(`[Callback] getAll called, returning ${cookies.length} cookies`)
            return cookies
          },
          setAll(cookies) {
            console.log(`[Callback] setAll called with ${cookies.length} cookies`)
            // Collect cookies to set on the redirect response
            cookies.forEach(({ name, value, options }) => {
              console.log(`[Callback] Cookie to set: ${name} (${value.length} chars)`)
              cookiesToSet.push({ name, value, options: options || {} })
            })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[Callback] exchangeCodeForSession ERROR:', error.message)
      return NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url)
      )
    }

    console.log(`[Callback] exchangeCodeForSession SUCCESS: user=${data.session?.user?.email}, access_token=${data.session?.access_token ? 'exists' : 'none'}`)
    console.log(`[Callback] Cookies collected for redirect: ${cookiesToSet.length}`)
    cookiesToSet.forEach(c => console.log(`[Callback] Will set cookie: ${c.name}`))
  } else {
    console.log('[Callback] No code provided, skipping exchange')
  }

  // Helper function to create redirect with cookies
  const createRedirectWithCookies = (url: URL) => {
    console.log(`[Callback] Creating redirect to: ${url.toString()}`)
    const response = NextResponse.redirect(url)
    // Set all cookies collected during session exchange
    console.log(`[Callback] Setting ${cookiesToSet.length} cookies on response`)
    cookiesToSet.forEach(({ name, value, options }) => {
      console.log(`[Callback] Setting cookie on response: ${name}`)
      // Ensure cookies are accessible from JavaScript (httpOnly: false)
      // and from all routes (path: '/')
      const cookieOptions = {
        ...options,
        path: '/',
        httpOnly: false, // Required for browser client to read auth tokens
      } as Parameters<typeof response.cookies.set>[2]
      response.cookies.set(name, value, cookieOptions)
    })
    // Log response cookies
    const responseCookies = response.cookies.getAll()
    console.log(`[Callback] Response now has ${responseCookies.length} cookies`)
    responseCookies.forEach(c => console.log(`[Callback] Response cookie: ${c.name}`))
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

