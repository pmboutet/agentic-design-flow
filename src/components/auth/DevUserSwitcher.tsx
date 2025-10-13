"use client";

import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Cog, Loader2, LogOut } from "lucide-react";
import { useAuth } from "./AuthProvider";

const IS_DEV_SWITCHER_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_DEV_USER_SWITCHER === "true";

export function DevUserSwitcher() {
  const { availableUsers, user, switchUser, status, isProcessing } = useAuth();

  if (!IS_DEV_SWITCHER_ENABLED) {
    return null;
  }

  const activeLabel = user ? user.fullName : "Invité";

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-slate-900/75 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur transition hover:bg-slate-900"
            aria-label="Ouvrir le sélecteur d'utilisateur de développement"
          >
            <Cog className="h-4 w-4" />
            <span>Dev&nbsp;: {activeLabel}</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          side="top"
          align="end"
          className="mb-2 w-72 rounded-2xl border border-slate-200 bg-white/95 p-2 text-sm text-slate-700 shadow-xl backdrop-blur"
        >
          <DropdownMenu.Label className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Utilisateurs liés au projet
          </DropdownMenu.Label>
          {availableUsers.map(candidate => {
            const isActive = user?.id === candidate.id;
            return (
              <DropdownMenu.Item
                key={candidate.id}
                className="flex cursor-pointer items-start justify-between gap-3 rounded-xl px-3 py-2 outline-none transition hover:bg-slate-100 data-[disabled=true]:cursor-not-allowed"
                disabled={isProcessing}
                onSelect={event => {
                  event.preventDefault();
                  void switchUser(candidate.id);
                }}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900">{candidate.fullName}</span>
                  {candidate.role && (
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">{candidate.role}</span>
                  )}
                  <span className="text-[11px] text-slate-400">{candidate.email}</span>
                </div>
                {isActive ? <Check className="h-4 w-4 text-emerald-500" /> : null}
              </DropdownMenu.Item>
            );
          })}
          <DropdownMenu.Separator className="my-2 h-px bg-slate-200" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 outline-none transition hover:bg-slate-100 data-[disabled=true]:cursor-not-allowed"
            disabled={isProcessing || status === "signed-out"}
            onSelect={event => {
              event.preventDefault();
              void switchUser(null);
            }}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <LogOut className="h-4 w-4 text-slate-500" />}
            <span>Se déconnecter</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
}
