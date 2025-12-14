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

  // Explicit cookie configuration to handle chunked cookies properly
  return createBrowserClient(url, key, {
    cookies: {
      getAll() {
        const cookies: { name: string; value: string }[] = [];
        if (typeof document === 'undefined') return cookies;

        const cookieStr = document.cookie;
        if (!cookieStr) return cookies;

        cookieStr.split(';').forEach(cookie => {
          const [name, ...valueParts] = cookie.trim().split('=');
          if (name) {
            cookies.push({
              name: name.trim(),
              value: valueParts.join('=') // Handle values with = in them
            });
          }
        });

        return cookies;
      },
      setAll(cookiesToSet) {
        if (typeof document === 'undefined') return;

        cookiesToSet.forEach(({ name, value, options }) => {
          let cookieString = `${name}=${value}`;

          if (options?.path) cookieString += `; path=${options.path}`;
          if (options?.maxAge) cookieString += `; max-age=${options.maxAge}`;
          if (options?.domain) cookieString += `; domain=${options.domain}`;
          if (options?.secure) cookieString += '; secure';
          if (options?.sameSite) cookieString += `; samesite=${options.sameSite}`;

          document.cookie = cookieString;
        });
      },
    },
  });
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

