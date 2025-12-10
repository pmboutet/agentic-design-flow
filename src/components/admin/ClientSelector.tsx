"use client";

import { Building2, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientContext } from "./ClientContext";

interface ClientSelectorProps {
  collapsed?: boolean;
}

export function ClientSelector({ collapsed = false }: ClientSelectorProps) {
  const {
    selectedClientId,
    setSelectedClientId,
    clients,
    isLoading,
    hasMultipleClients,
  } = useClientContext();

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2",
        collapsed ? "justify-center" : ""
      )}>
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        {!collapsed && <span className="text-sm text-slate-400">Chargement...</span>}
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2",
        collapsed ? "justify-center" : ""
      )}>
        <Building2 className="h-4 w-4 text-slate-500" />
        {!collapsed && <span className="text-sm text-slate-400">Aucun client</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!collapsed && (
        <div className="text-xs font-medium uppercase tracking-wider text-slate-400 px-1">
          Client
        </div>
      )}
      <div className="relative">
        <select
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-xl border border-white/10 bg-white/5 text-sm text-white transition",
            "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500/50",
            "cursor-pointer",
            collapsed ? "px-2 py-2 pr-6" : "px-3 py-2 pr-8"
          )}
          aria-label="Sélectionner un client"
        >
          {hasMultipleClients && (
            <option value="all" className="bg-slate-900">
              {collapsed ? "Tous" : "Tous les clients"}
            </option>
          )}
          {clients.map(client => (
            <option key={client.id} value={client.id} className="bg-slate-900">
              {collapsed ? client.name.slice(0, 3) : client.name}
            </option>
          ))}
        </select>
        <ChevronDown className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400",
          collapsed ? "right-1" : "right-2"
        )} />
      </div>
    </div>
  );
}
