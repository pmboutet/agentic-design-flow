"use client";

import { useMemo, useState, useRef, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Building2,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  Menu,
  MessageSquare,
  ScrollText,
  Search,
  Target,
  Users,
  X,
  Loader2,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserProfileMenu } from "@/components/auth/UserProfileMenu";
import { AdminSearchProvider, useAdminSearch } from "./AdminSearchContext";
import { Input } from "@/components/ui/input";
import { AnimatePresence, motion } from "framer-motion";

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
    label: "Users",
    href: "/admin/users",
    icon: Users,
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

function AdminSearchBar() {
  const search = useAdminSearch();

  if (!search || !search.searchResultTypeConfig || Object.keys(search.searchResultTypeConfig).length === 0) {
    // Show a disabled search bar if context is not fully initialized
    return (
      <div className="hidden md:flex md:max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Search across clients, projects, sessions..."
            className="w-full rounded-xl border-white/10 bg-white/5 pl-9 pr-10 text-sm text-white placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0 opacity-50"
            aria-label="Search across clients, projects, sessions"
            disabled
          />
        </div>
      </div>
    );
  }

  const {
    searchQuery,
    isSearchFocused,
    useVectorSearch,
    setUseVectorSearch,
    isVectorSearching,
    enhancedSearchResults,
    hasSearchResults,
    showSearchDropdown,
    searchInputRef,
    searchResultTypeConfig,
    handleSearchChange,
    handleSearchFocus,
    handleSearchBlur,
    handleSearchKeyDown,
    handleClearSearch,
    handleSearchSelect,
  } = search;

  return (
    <div className="hidden md:flex md:max-w-md">
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          ref={searchInputRef}
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search across clients, projects, sessions..."
          className="w-full rounded-xl border-white/10 bg-white/5 pl-9 pr-10 text-sm text-white placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label="Search across clients, projects, sessions"
          aria-expanded={showSearchDropdown && hasSearchResults}
          aria-haspopup="listbox"
          aria-controls="admin-search-results"
          role="combobox"
          autoComplete="off"
        />
        {searchQuery && (
          <button
            type="button"
            onMouseDown={event => event.preventDefault()}
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-300 transition hover:text-white"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <AnimatePresence>
          {showSearchDropdown && (
            <motion.div
              id="admin-search-results"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-12 z-50 rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-2xl backdrop-blur"
              role="listbox"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-wide text-slate-400">Results</span>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={useVectorSearch}
                      onChange={(e) => setUseVectorSearch(e.target.checked)}
                      className="h-3 w-3 rounded border-white/20 bg-slate-900"
                    />
                    <span>Recherche sémantique</span>
                    {isVectorSearching && <Loader2 className="h-3 w-3 animate-spin" />}
                  </label>
                </div>
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  {hasSearchResults
                    ? `${enhancedSearchResults.length} match${enhancedSearchResults.length > 1 ? "es" : ""}`
                    : "No results"}
                </span>
              </div>
              <div className="space-y-1">
                {hasSearchResults ? (
                  enhancedSearchResults.map(result => {
                    const config = searchResultTypeConfig[result.type];
                    const Icon = config.icon;
                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        type="button"
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => handleSearchSelect(result)}
                        role="option"
                      >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-white">{result.title}</p>
                          <p className="text-xs text-slate-300">
                            {config.label}
                            {result.subtitle ? ` • ${result.subtitle}` : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-sm text-slate-300">
                    No matches for &ldquo;{searchQuery}&rdquo;
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function AdminPageLayout({ children }: AdminPageLayoutProps) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Search state - will be overridden by AdminDashboard if it provides its own
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [useVectorSearch, setUseVectorSearch] = useState(false);
  const [isVectorSearching, setIsVectorSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBlurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [enhancedSearchResults, setEnhancedSearchResults] = useState<any[]>([]);
  const [searchResultTypeConfig, setSearchResultTypeConfig] = useState<Record<string, any>>({
    client: { label: "Client", icon: Building2 },
    project: { label: "Project", icon: FolderKanban },
    challenge: { label: "Challenge", icon: Target },
    ask: { label: "ASK Session", icon: MessageSquare },
    user: { label: "User", icon: Users },
  });

  const hasSearchResults = enhancedSearchResults.length > 0;
  const showSearchDropdown = isSearchFocused && (searchQuery.trim().length > 0 || (useVectorSearch && enhancedSearchResults.length > 0));

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  }, []);

  const handleSearchFocus = useCallback(() => {
    if (searchBlurTimeoutRef.current) {
      clearTimeout(searchBlurTimeoutRef.current);
      searchBlurTimeoutRef.current = null;
    }
    setIsSearchFocused(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    searchBlurTimeoutRef.current = setTimeout(() => {
      setIsSearchFocused(false);
    }, 150);
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSearchQuery("");
        setIsSearchFocused(false);
        searchInputRef.current?.blur();
      }
    },
    []
  );

  const handleClearSearch = useCallback(() => {
    if (searchBlurTimeoutRef.current) {
      clearTimeout(searchBlurTimeoutRef.current);
      searchBlurTimeoutRef.current = null;
    }
    setSearchQuery("");
    setIsSearchFocused(true);
    searchInputRef.current?.focus();
  }, []);

  const handleSearchSelect = useCallback(() => {
    // This will be overridden by AdminDashboard
  }, []);

  const defaultSearchContext = {
    searchQuery,
    setSearchQuery,
    isSearchFocused,
    setIsSearchFocused,
    useVectorSearch,
    setUseVectorSearch,
    isVectorSearching,
    enhancedSearchResults,
    hasSearchResults,
    showSearchDropdown,
    searchInputRef,
    searchResultTypeConfig,
    handleSearchChange,
    handleSearchFocus,
    handleSearchBlur,
    handleSearchKeyDown,
    handleClearSearch,
    handleSearchSelect,
  };

  const activeHref = useMemo(() => {
    // Filter all matching items, then pick the most specific (longest href)
    const matchingItems = navigationItems.filter(item => {
      if (item.href === "/admin") {
        return pathname === item.href;
      }
      return pathname.startsWith(item.href);
    });
    // Sort by href length descending to get the most specific match
    const mostSpecific = matchingItems.sort(
      (a, b) => b.href.length - a.href.length
    )[0];
    return mostSpecific?.href ?? null;
  }, [pathname]);

  const sidebarContent = (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      <div className={cn(
        "flex items-center gap-3 overflow-hidden",
        isSidebarCollapsed ? "flex-col" : "justify-between"
      )}>
        <div
          className={cn(
            "flex items-center gap-2 text-left flex-shrink-0",
            isSidebarCollapsed ? "justify-center" : ""
          )}
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-sm font-semibold">
            AD
          </div>
          {!isSidebarCollapsed && (
            <div className="overflow-hidden">
              <div className="text-sm font-semibold text-white truncate">Agentic Admin</div>
              <p className="text-xs text-slate-400 truncate">Control center</p>
            </div>
          )}
        </div>
        <button
          type="button"
          className="hidden rounded-xl border border-white/10 bg-white/10 p-2 text-slate-200 transition hover:bg-white/20 md:inline-flex flex-shrink-0"
          onClick={() => setIsSidebarCollapsed(value => !value)}
          aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-hidden">
        {navigationItems.map(item => {
          const Icon = item.icon;
          const isActive = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition overflow-hidden",
                isActive
                  ? "bg-white/10 text-white shadow-lg"
                  : "text-slate-300 hover:bg-white/5 hover:text-foreground",
                isSidebarCollapsed ? "justify-center px-2" : ""
              )}
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
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
    <AdminSearchProvider value={defaultSearchContext}>
      <div className="admin-layout min-h-screen h-screen overflow-hidden bg-slate-950 text-slate-100">
        <div className="flex h-full min-h-0">
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

          <div className="flex flex-1 flex-col min-h-0">
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
                  <AdminSearchBar />
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
    </AdminSearchProvider>
  );
}
