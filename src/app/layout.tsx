import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agentic Design Flow",
  description: "Collective idea emergence and specification system with AI-driven chat and challenge management",
  keywords: ["ai", "chat", "collaboration", "design", "agentic", "webhooks"],
  authors: [{ name: "pmboutet" }],
  viewport: "width=device-width, initial-scale=1",
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
        {children}
      </body>
    </html>
  );
}
