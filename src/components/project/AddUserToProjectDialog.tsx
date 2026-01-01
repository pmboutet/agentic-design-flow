"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, UserPlus, X, Search, Mail, User, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectMember } from "@/types";
import { cn } from "@/lib/utils";

interface AddUserToProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Optional ASK ID - if provided, adds to ASK participants instead of just project members */
  askId?: string;
  currentMemberUserIds?: string[];
  onUserAdded: (result: { userId: string; userCreated: boolean }) => void;
}

type Mode = "search" | "create";

/**
 * DRY component for adding users to a project (or ASK).
 * Supports both searching existing users and creating new ones.
 * Uses the cascade logic (adds to client, then project).
 * If askId is provided, also adds to ask_participants.
 */
export function AddUserToProjectDialog({
  open,
  onOpenChange,
  projectId,
  askId,
  currentMemberUserIds = [],
  onUserAdded,
}: AddUserToProjectDialogProps) {
  const [mode, setMode] = useState<Mode>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProjectMember[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create user form state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");
  const [newUserDescription, setNewUserDescription] = useState("");

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setMode("search");
      setSearchQuery("");
      setSearchResults([]);
      setNewUserEmail("");
      setNewUserFirstName("");
      setNewUserLastName("");
      setNewUserDescription("");
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  // Search for available users
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    setError(null);

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/admin/projects/${projectId}/search-users?query=${encodeURIComponent(query)}`,
        { credentials: "include" }
      );
      const payload = await response.json();

      if (payload.success) {
        // Filter out users who are already members
        const filteredResults = (payload.data ?? []).filter(
          (user: ProjectMember) => !currentMemberUserIds.includes(user.id)
        );
        setSearchResults(filteredResults);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [projectId, currentMemberUserIds]);

  // Add existing user
  const handleAddExistingUser = useCallback(async (userId: string) => {
    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      // Use ASK endpoint if askId is provided, otherwise use project endpoint
      const endpoint = askId
        ? `/api/admin/asks/${askId}/add-participant`
        : `/api/admin/projects/${projectId}/members`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      const payload = await response.json();

      if (response.ok && payload.success) {
        setSuccess(askId ? "Participant ajouté avec succès" : "Utilisateur ajouté avec succès");
        onUserAdded({ userId, userCreated: false });
        setTimeout(() => {
          onOpenChange(false);
        }, 1000);
      } else {
        setError(payload.error || "Erreur lors de l'ajout de l'utilisateur");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setIsBusy(false);
    }
  }, [projectId, askId, onUserAdded, onOpenChange]);

  // Create new user and add
  const handleCreateAndAdd = useCallback(async () => {
    if (!newUserEmail.trim()) {
      setError("L'email est requis");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail.trim())) {
      setError("Format d'email invalide");
      return;
    }

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      // Use ASK endpoint if askId is provided, otherwise use project endpoint
      const endpoint = askId
        ? `/api/admin/asks/${askId}/add-participant`
        : `/api/admin/projects/${projectId}/members`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          createUser: {
            email: newUserEmail.trim(),
            firstName: newUserFirstName.trim() || undefined,
            lastName: newUserLastName.trim() || undefined,
          },
          description: newUserDescription.trim() || undefined,
        }),
      });

      const payload = await response.json();

      if (response.ok && payload.success) {
        const message = payload.data?.userCreated
          ? (askId ? "Utilisateur créé et ajouté comme participant" : "Utilisateur créé et ajouté au projet")
          : (askId ? "Utilisateur existant ajouté comme participant" : "Utilisateur existant ajouté au projet");
        setSuccess(message);
        onUserAdded({
          userId: payload.data?.userId,
          userCreated: payload.data?.userCreated ?? false,
        });
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      } else {
        setError(payload.error || "Erreur lors de la création");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setIsBusy(false);
    }
  }, [projectId, askId, newUserEmail, newUserFirstName, newUserLastName, newUserDescription, onUserAdded, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl my-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-white flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-indigo-400" />
                  Ajouter un participant
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-400 mt-1">
                  Recherchez un utilisateur existant ou créez-en un nouveau
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/10 p-1.5 text-slate-200 transition hover:bg-white/20"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* Mode toggle */}
            <div className="mt-4 flex rounded-xl border border-white/10 bg-slate-900/40 p-1">
              <button
                type="button"
                onClick={() => setMode("search")}
                className={cn(
                  "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition",
                  mode === "search"
                    ? "bg-indigo-500 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Search className="h-4 w-4 inline mr-2" />
                Rechercher
              </button>
              <button
                type="button"
                onClick={() => setMode("create")}
                className={cn(
                  "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition",
                  mode === "create"
                    ? "bg-indigo-500 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                <UserPlus className="h-4 w-4 inline mr-2" />
                Créer
              </button>
            </div>

            {/* Feedback */}
            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                {success}
              </div>
            )}

            {/* Search mode */}
            {mode === "search" && (
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={e => handleSearch(e.target.value)}
                    placeholder="Rechercher par nom ou email (min. 2 caractères)..."
                    className="pl-10"
                    disabled={isBusy}
                    autoFocus
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                  )}
                </div>

                {/* Search results */}
                {searchResults.length > 0 && (
                  <div className="max-h-[250px] overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-slate-900/40 p-2">
                    {searchResults.map(user => (
                      <article
                        key={user.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 hover:bg-slate-800/60 transition"
                      >
                        <div className="text-left min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-white truncate">
                            {user.fullName || user.email}
                          </h4>
                          <p className="text-xs text-slate-400 truncate">{user.email}</p>
                          {user.jobTitle && (
                            <p className="text-xs text-slate-500 italic truncate">{user.jobTitle}</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="glassDark"
                          size="sm"
                          className="h-8 px-3 text-xs ml-2 shrink-0"
                          onClick={() => handleAddExistingUser(user.id)}
                          disabled={isBusy}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Ajouter"
                          )}
                        </Button>
                      </article>
                    ))}
                  </div>
                )}

                {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 text-center">
                    <p className="text-sm text-slate-400">
                      Aucun utilisateur trouvé pour &quot;{searchQuery}&quot;
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setMode("create");
                        // If search looks like an email, pre-fill it
                        if (searchQuery.includes("@")) {
                          setNewUserEmail(searchQuery);
                        }
                      }}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Créer un nouvel utilisateur
                    </Button>
                  </div>
                )}

                {searchQuery.length < 2 && (
                  <p className="text-xs text-slate-500 text-center py-2">
                    Tapez au moins 2 caractères pour rechercher
                  </p>
                )}
              </div>
            )}

            {/* Create mode */}
            {mode === "create" && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-user-email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    Email *
                  </Label>
                  <Input
                    id="new-user-email"
                    type="email"
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    placeholder="email@exemple.com"
                    disabled={isBusy}
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-user-firstname" className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      Prénom
                    </Label>
                    <Input
                      id="new-user-firstname"
                      type="text"
                      value={newUserFirstName}
                      onChange={e => setNewUserFirstName(e.target.value)}
                      placeholder="Jean"
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-user-lastname">Nom</Label>
                    <Input
                      id="new-user-lastname"
                      type="text"
                      value={newUserLastName}
                      onChange={e => setNewUserLastName(e.target.value)}
                      placeholder="Dupont"
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-user-description" className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    Description (projet)
                  </Label>
                  <Textarea
                    id="new-user-description"
                    value={newUserDescription}
                    onChange={e => setNewUserDescription(e.target.value)}
                    placeholder="Rôle et contexte du participant pour ce projet..."
                    disabled={isBusy}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-slate-500">
                    Cette description sera utilisée par l&apos;IA pour personnaliser les échanges.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="glassDark"
                    onClick={() => onOpenChange(false)}
                    disabled={isBusy}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCreateAndAdd}
                    disabled={isBusy || !newUserEmail.trim()}
                    className="bg-indigo-500 hover:bg-indigo-400"
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Création...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Créer et ajouter
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
