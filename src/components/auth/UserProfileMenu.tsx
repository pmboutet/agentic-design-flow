"use client";

import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Loader2, LogIn, LogOut, Settings, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthProvider";

function getInitials(name?: string | null) {
  if (!name) return "";
  const parts = name
    .trim()
    .split(" ")
    .filter(Boolean);
  if (parts.length === 0) return "";
  const [first, second] = parts;
  const firstInitial = first?.charAt(0) ?? "";
  const secondInitial = second?.charAt(0) ?? "";
  return (firstInitial + secondInitial).toUpperCase();
}

export function UserProfileMenu() {
  const { status, user, signIn, signOut, isProcessing } = useAuth();
  const isSignedIn = status === "signed-in" && Boolean(user);
  const fullName = user?.fullName ?? "";
  const email = user?.email ?? "";
  const role = user?.role ?? undefined;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          className={`flex items-center justify-center text-white transition-all duration-200 hover:bg-white/10 hover:scale-110 ${
            isSignedIn 
              ? "h-10 w-10 rounded-full" 
              : "h-12 w-12 rounded-xl"
          }`}
          disabled={status === "loading"}
        >
          {isSignedIn ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-sm font-bold text-white">
              {getInitials(fullName)}
            </div>
          ) : (
            <UserCircle2 className="h-8 w-8" />
          )}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="z-50 mt-2 w-64 rounded-2xl border border-white/60 bg-white/90 p-3 text-sm shadow-xl backdrop-blur">
        <DropdownMenu.Label className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Profil utilisateur
        </DropdownMenu.Label>
        <div className="rounded-xl bg-white/70 p-3 shadow-inner">
          {isSignedIn ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{fullName}</p>
              <p className="text-xs text-muted-foreground">{email}</p>
              {role && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {role}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Connectez-vous pour synchroniser vos défis, conversations et expériences personnalisées.
            </p>
          )}
        </div>

        <DropdownMenu.Separator className="my-3 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        {isSignedIn ? (
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-foreground outline-none transition hover:bg-primary/10"
          >
            <Settings className="h-4 w-4 text-primary" />
            Paramètres du compte
          </DropdownMenu.Item>
        ) : (
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-foreground outline-none transition hover:bg-primary/10"
          >
            <Settings className="h-4 w-4 text-primary" />
            Préférences invité
          </DropdownMenu.Item>
        )}

        <DropdownMenu.Arrow className="fill-white/70" />

        <div className="mt-3 rounded-xl bg-gradient-to-r from-primary/90 to-accent/90 p-3 text-white">
          {isSignedIn ? (
            <Button
              onClick={() => signOut()}
              variant="glassDark"
              className="flex w-full items-center justify-center gap-2 rounded-full"
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Se déconnecter
            </Button>
          ) : (
            <Button
              onClick={() => signIn()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-white/90 text-primary hover:bg-white"
              disabled={isProcessing || status === "loading"}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Se connecter
            </Button>
          )}
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
