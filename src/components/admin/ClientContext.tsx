"use client";

import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ClientRecord } from "@/types";

export type ClientSelection = string | "all"; // Client ID or "all"

interface ClientContextValue {
  // Current selection
  selectedClientId: ClientSelection;
  setSelectedClientId: (clientId: ClientSelection) => void;

  // Available clients (fetched from API)
  clients: ClientRecord[];
  isLoading: boolean;
  error: string | null;

  // Helper to get selected client object
  selectedClient: ClientRecord | null;

  // Check if multiple clients are available
  hasMultipleClients: boolean;

  // Refresh clients list
  refreshClients: () => Promise<void>;
}

const ClientContext = createContext<ClientContextValue | null>(null);

const STORAGE_KEY = "admin-selected-client";

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientIdState] = useState<ClientSelection>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load clients from API
  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/clients", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load clients");
      }
      setClients(payload.data ?? []);
    } catch (err) {
      console.error("Failed to load clients", err);
      setError(err instanceof Error ? err.message : "Unable to load clients");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    fetchClients().then(() => {
      setIsInitialized(true);
    });
  }, [fetchClients]);

  // Load saved selection from localStorage after clients are loaded
  useEffect(() => {
    if (!isInitialized || clients.length === 0) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      // Validate the saved selection still exists
      if (saved === "all" || clients.some(c => c.id === saved)) {
        setSelectedClientIdState(saved);
      } else {
        // Invalid saved selection, default to first client or "all"
        setSelectedClientIdState(clients.length > 1 ? "all" : clients[0]?.id ?? "all");
      }
    } else {
      // No saved selection, default based on number of clients
      setSelectedClientIdState(clients.length > 1 ? "all" : clients[0]?.id ?? "all");
    }
  }, [clients, isInitialized]);

  // Save selection to localStorage when it changes
  const setSelectedClientId = useCallback((clientId: ClientSelection) => {
    setSelectedClientIdState(clientId);
    localStorage.setItem(STORAGE_KEY, clientId);
  }, []);

  // Get the selected client object
  const selectedClient = useMemo(() => {
    if (selectedClientId === "all") return null;
    return clients.find(c => c.id === selectedClientId) ?? null;
  }, [clients, selectedClientId]);

  const hasMultipleClients = clients.length > 1;

  const value = useMemo<ClientContextValue>(() => ({
    selectedClientId,
    setSelectedClientId,
    clients,
    isLoading,
    error,
    selectedClient,
    hasMultipleClients,
    refreshClients: fetchClients,
  }), [selectedClientId, setSelectedClientId, clients, isLoading, error, selectedClient, hasMultipleClients, fetchClients]);

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClientContext() {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error("useClientContext must be used within a ClientProvider");
  }
  return context;
}

// Optional hook that doesn't throw if context is not available
export function useClientContextOptional() {
  return useContext(ClientContext);
}
