"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Users, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectMember } from "@/types";
import { cn } from "@/lib/utils";

interface AddParticipantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  projectMembers: ProjectMember[];
  onMembersChange: () => void;
}

export function AddParticipantsDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  projectMembers,
  onMembersChange,
}: AddParticipantsDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProjectMember[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Search for available users
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);

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
        setSearchResults(payload.data ?? []);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [projectId]);

  // Load initial users when dialog opens
  useEffect(() => {
    if (open) {
      handleSearch("");
    }
  }, [open, handleSearch]);

  // Add user to project
  const handleAddUser = useCallback(async (userId: string) => {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, role: "member" }),
      });

      if (response.ok) {
        setSelectedUserId(null);
        setSearchQuery("");
        setSearchResults([]);
        onMembersChange();
      }
    } finally {
      setIsBusy(false);
    }
  }, [projectId, onMembersChange]);

  // Remove user from project
  const handleRemoveUser = useCallback(async (userId: string) => {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        onMembersChange();
      }
    } finally {
      setIsBusy(false);
    }
  }, [projectId, onMembersChange]);

  // Filter search results to exclude current members
  const availableUsers = useMemo(() => {
    const memberIds = new Set(projectMembers.map(m => m.id));
    return searchResults.filter(u => !memberIds.has(u.id));
  }, [searchResults, projectMembers]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl my-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-white">
                  Ajouter des participants
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-300">
                  Gérer les participants du projet {projectName}
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

            {/* Search and add user */}
            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="add-participant-search">Rechercher un utilisateur à ajouter</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="add-participant-search"
                    type="text"
                    value={searchQuery}
                    onChange={e => handleSearch(e.target.value)}
                    placeholder="Rechercher par nom, email ou job title..."
                    className="pl-10"
                    disabled={isBusy}
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                  )}
                </div>
              </div>

              {/* Search results */}
              {availableUsers.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {availableUsers.map(user => (
                    <article
                      key={user.id}
                      className={cn(
                        "flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 cursor-pointer transition",
                        selectedUserId === user.id ? "border-indigo-500/50 bg-indigo-500/10" : "hover:bg-slate-800/60"
                      )}
                      onClick={() => setSelectedUserId(selectedUserId === user.id ? null : user.id)}
                    >
                      <div className="text-left">
                        <h4 className="text-sm font-semibold text-white">
                          {user.fullName || user.email}
                        </h4>
                        <p className="text-xs text-slate-400">{user.email}</p>
                        {user.jobTitle && (
                          <p className="text-xs text-slate-500 italic">{user.jobTitle}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="glassDark"
                        size="sm"
                        className="h-7 px-3 text-[11px]"
                        onClick={e => {
                          e.stopPropagation();
                          handleAddUser(user.id);
                        }}
                        disabled={isBusy}
                      >
                        Ajouter
                      </Button>
                    </article>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && !isSearching && availableUsers.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">
                  Aucun utilisateur trouvé pour cette recherche.
                </p>
              )}
            </div>

            {/* List of current project members */}
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-indigo-300" />
                <h3 className="text-sm font-medium text-white">
                  Participants actuels ({projectMembers.length})
                </h3>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {projectMembers.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">
                    Aucun participant dans ce projet.
                  </p>
                ) : (
                  projectMembers.map(user => (
                    <article
                      key={user.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3"
                    >
                      <div className="text-left">
                        <h4 className="text-sm font-semibold text-white">
                          {user.fullName || user.email}
                        </h4>
                        <p className="text-xs text-slate-400">{user.email}</p>
                        {user.jobTitle && (
                          <p className="text-xs text-slate-500 italic">{user.jobTitle}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {user.role && (
                          <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">
                            {user.role}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="glassDark"
                          size="sm"
                          className="h-7 px-3 text-[11px]"
                          onClick={() => handleRemoveUser(user.id)}
                          disabled={isBusy}
                        >
                          Retirer
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
