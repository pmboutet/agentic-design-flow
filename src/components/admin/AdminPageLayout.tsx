"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  Menu,
  ScrollText,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserProfileMenu } from "@/components/auth/UserProfileMenu";

interface AdminPageLayoutProps {
  children: ReactNode;
}

interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const navigationItems: AdminNavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Projects",
    href: "/admin/projects",
    icon: FolderKanban,
  },
  {
    label: "AI agents",
    href: "/admin/ai",
    icon: Bot,
  },
  {
    label: "AI logs",
    href: "/admin/ai/logs",
    icon: ScrollText,
  },
];

export function AdminPageLayout({ children }: AdminPageLayoutProps) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const activeHref = useMemo(() => {
    const entry = navigationItems.find(item => {
      if (item.href === "/admin") {
        return pathname === item.href;
      }
      return pathname.startsWith(item.href);
    });
    return entry?.href ?? null;
  }, [pathname]);

  const sidebarContent = (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex items-center gap-2 text-left",
            isSidebarCollapsed ? "justify-center" : ""
          )}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-sm font-semibold">
            AD
          </div>
          {!isSidebarCollapsed && (
            <div>
              <div className="text-sm font-semibold text-white">Agentic Admin</div>
              <p className="text-xs text-slate-400">Control center</p>
            </div>
          )}
        </div>
        <button
          type="button"
          className="hidden rounded-xl border border-white/10 bg-white/10 p-2 text-slate-200 transition hover:bg-white/20 md:inline-flex"
          onClick={() => setIsSidebarCollapsed(value => !value)}
          aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navigationItems.map(item => {
          const Icon = item.icon;
          const isActive = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                isActive
                  ? "bg-white/10 text-white shadow-lg"
                  : "text-slate-300 hover:bg-white/5 hover:text-foreground",
                isSidebarCollapsed ? "justify-center px-2" : ""
              )}
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <Icon className="h-4 w-4" />
              {!isSidebarCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!isSidebarCollapsed && (
        <div className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
          <p className="font-medium text-white">Need help?</p>
          <p className="mt-1">Review the admin playbook or contact the product team.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "hidden border-r border-white/10 bg-slate-950/70 px-5 py-6 backdrop-blur md:flex",
            isSidebarCollapsed ? "w-20" : "w-64"
          )}
        >
          {sidebarContent}
        </aside>

        {isMobileSidebarOpen ? (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="Close navigation"
            />
            <div className="relative z-10 h-full w-72 border-r border-white/10 bg-slate-950/95 px-5 py-6">
              {sidebarContent}
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-foreground transition hover:bg-white/10 md:hidden"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  aria-label="Open navigation"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="hidden text-sm text-slate-300 md:block">Admin console</div>
              </div>
              <div className="flex items-center gap-3">
                <UserProfileMenu />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
