/**
 * Gets the base URL for magic links
 * 
 * Priority:
 * 1. NEXT_PUBLIC_APP_URL (configured in Vercel or .env.local)
 * 2. localhost:3000 (fallback for local dev)
 */
function getBaseUrl(): string {
  // Use NEXT_PUBLIC_APP_URL if configured (works for both dev and production)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // Fallback to localhost for local development
  return 'http://localhost:3000';
}

/**
 * Generates a magic link URL for a participant without sending an email.
 * This can be used to display links that admins can copy/paste.
 * 
 * @param email - Email address for the participant (optional, for display purposes)
 * @param askKey - Ask session key for the redirect URL
 * @param participantToken - Optional unique token for the participant (if provided, uses token instead of key)
 * @returns The magic link URL
 */
export function generateMagicLinkUrl(
  email: string, 
  askKey: string, 
  participantToken?: string
): string {
  const baseUrl = getBaseUrl();
  
  // If we have a participant token, use it for a unique link per participant
  if (participantToken) {
    return `${baseUrl}/?token=${participantToken}`;
  }
  
  // Otherwise, use the askKey (backward compatible)
  return `${baseUrl}/?key=${askKey}`;
}

/**
 * Sends a magic link email to the specified email address.
 * The link will redirect to the ask session page.
 * 
 * @param email - Email address to send magic link to
 * @param askKey - Ask session key for the redirect URL
 * @param projectId - Project ID (optional, for context)
 * @returns Success status and any error message
 */
export async function sendMagicLink(
  email: string,
  askKey: string,
  projectId?: string,
  participantToken?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Build the redirect URL - Supabase will redirect here after user clicks magic link
    // The user will be authenticated automatically by Supabase
    const redirectUrl = generateMagicLinkUrl(normalizedEmail, askKey, participantToken);

    // Create a client with anon key for sending OTP
    // This will send a magic link email via Supabase's built-in email service
    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false }
      }
    );

    // Send OTP email (magic link email)
    // When user clicks the link, Supabase will redirect them to the redirectUrl
    const { error: otpError } = await anonClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (otpError) {
      console.error(`Failed to send magic link email to ${normalizedEmail}:`, otpError);
      return { success: false, error: otpError.message };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error sending magic link to ${email}:`, error);
    return { success: false, error: errorMessage };
  }
}
