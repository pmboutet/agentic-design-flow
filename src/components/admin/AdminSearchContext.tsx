"use client";

import { createContext, useContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type SearchResultType = "client" | "project" | "challenge" | "ask" | "user";

export interface SearchResultItem {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  clientId?: string | null;
  projectId?: string | null;
  challengeId?: string | null;
}

export interface SearchResultTypeConfig {
  label: string;
  icon: LucideIcon;
}

interface AdminSearchContextValue {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchFocused: boolean;
  setIsSearchFocused: (focused: boolean) => void;
  useVectorSearch: boolean;
  setUseVectorSearch: (use: boolean) => void;
  isVectorSearching: boolean;
  enhancedSearchResults: SearchResultItem[];
  hasSearchResults: boolean;
  showSearchDropdown: boolean;
  searchInputRef: React.RefObject<HTMLInputElement> | null;
  searchResultTypeConfig: Record<string, SearchResultTypeConfig>;
  handleSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSearchFocus: () => void;
  handleSearchBlur: () => void;
  handleSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleClearSearch: () => void;
  handleSearchSelect: (result: SearchResultItem) => void;
  // Allow updating the context from child components
  updateContext?: (updates: Partial<AdminSearchContextValue>) => void;
}

const AdminSearchContext = createContext<AdminSearchContextValue | null>(null);

export function AdminSearchProvider({
  children,
  value: initialValue,
}: {
  children: ReactNode;
  value: AdminSearchContextValue;
}) {
  const [contextValue, setContextValue] = useState<AdminSearchContextValue>(initialValue);
  const prevUpdatesRef = useRef<string>("");

  const updateContext = useCallback((updates: Partial<AdminSearchContextValue>) => {
    // Create a stable key from the updates to avoid unnecessary re-renders
    const updateKey = JSON.stringify({
      searchQuery: updates.searchQuery,
      isSearchFocused: updates.isSearchFocused,
      useVectorSearch: updates.useVectorSearch,
      isVectorSearching: updates.isVectorSearching,
      hasSearchResults: updates.hasSearchResults,
      showSearchDropdown: updates.showSearchDropdown,
      enhancedSearchResultsLength: updates.enhancedSearchResults?.length,
    });

    // Only update if something actually changed
    if (updateKey !== prevUpdatesRef.current) {
      prevUpdatesRef.current = updateKey;
      setContextValue(prev => ({ ...prev, ...updates }));
    }
  }, []);

  const valueWithUpdate = useMemo(() => ({
    ...contextValue,
    updateContext,
  }), [contextValue, updateContext]);

  return <AdminSearchContext.Provider value={valueWithUpdate}>{children}</AdminSearchContext.Provider>;
}

export function useAdminSearch() {
  const context = useContext(AdminSearchContext);
  if (!context) {
    return null;
  }
  return context;
}

