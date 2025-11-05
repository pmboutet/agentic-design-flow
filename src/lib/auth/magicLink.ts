/**
 * Generates a magic link URL for a participant without sending an email.
 * This can be used to display links that admins can copy/paste.
 * 
 * @param email - Email address for the participant
 * @param askKey - Ask session key for the redirect URL
 * @returns The magic link URL
 */
export function generateMagicLinkUrl(email: string, askKey: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                  (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('http') 
                    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin.replace(/\.supabase\.co$/, '')
                    : null) || 
                  'http://localhost:3000';
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
  projectId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Build the redirect URL - Supabase will redirect here after user clicks magic link
    // The user will be authenticated automatically by Supabase
    const redirectUrl = generateMagicLinkUrl(normalizedEmail, askKey);

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
