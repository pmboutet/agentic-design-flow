import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "react-datepicker/dist/react-datepicker.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { UserProfileMenu } from "@/components/auth/UserProfileMenu";

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
          <div className="fixed top-4 right-4 z-50">
            <UserProfileMenu />
          </div>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
