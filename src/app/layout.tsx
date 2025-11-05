import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { DevUserSwitcher } from "@/components/dev/DevUserSwitcher";
import { DevUserSwitcherSpacer } from "@/components/dev/DevUserSwitcherSpacer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agentic Design Flow",
  description: "Collective idea emergence and specification system with AI-driven chat and challenge management",
  keywords: ["ai", "chat", "collaboration", "design", "agentic", "webhooks"],
  authors: [{ name: "pmboutet" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      <body className={inter.className}>
        <AuthProvider>
          <DevUserSwitcher />
          <DevUserSwitcherSpacer />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
