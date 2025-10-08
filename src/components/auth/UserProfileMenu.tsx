"use client";

import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Loader2, LogIn, LogOut, Settings, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthProvider";

function getInitials(name: string) {
  const [first = "", second = ""] = name.trim().split(" ");
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

export function UserProfileMenu() {
  const { status, user, signIn, signOut, isProcessing } = useAuth();
  const isSignedIn = status === "signed-in" && Boolean(user);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-3 rounded-full border border-white/40 bg-white/70 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-white"
          disabled={status === "loading"}
        >
          <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-accent text-white">
            {isSignedIn ? (
              <span className="text-sm font-semibold">{getInitials(user.fullName)}</span>
            ) : (
              <UserCircle2 className="h-5 w-5" />
            )}
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-xs uppercase tracking-wide text-muted-foreground/80">
              {isSignedIn ? "Connecté" : status === "loading" ? "Chargement" : "Invité"}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {isSignedIn ? user.fullName : "Accéder"}
            </span>
          </div>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="z-50 mt-2 w-64 rounded-2xl border border-white/60 bg-white/90 p-3 text-sm shadow-xl backdrop-blur">
        <DropdownMenu.Label className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Profil utilisateur
        </DropdownMenu.Label>
        <div className="rounded-xl bg-white/70 p-3 shadow-inner">
          {isSignedIn ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              {user.role && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {user.role}
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
              variant="ghost"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-white/10 text-white hover:bg-white/20"
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
