import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { DevUserSwitcher } from "@/components/dev/DevUserSwitcher";
import { DevUserSwitcherSpacer } from "@/components/dev/DevUserSwitcherSpacer";

// Use system font stack as fallback when Google Fonts is unavailable
const fontClassName = "font-sans";

export const metadata: Metadata = {
  title: "Agentic Design Flow",
  description: "Collective idea emergence and specification system with AI-driven chat and challenge management",
  keywords: ["ai", "chat", "collaboration", "design", "agentic", "webhooks"],
  authors: [{ name: "pmboutet" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Root layout component for the application
 * Sets up global styling and metadata
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={fontClassName}>
        <AuthProvider>
          <DevUserSwitcher />
          <DevUserSwitcherSpacer />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
