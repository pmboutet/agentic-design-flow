"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Users, X, Search, Mail, User, FileText, UserPlus, Pencil, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectMember } from "@/types";
import { cn } from "@/lib/utils";

interface ManageProjectParticipantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Optional ASK ID - if provided, adds to ASK participants instead of just project members */
  askId?: string;
  /** Current project members to display and edit (optional, if not provided list mode is hidden) */
  projectMembers?: ProjectMember[];
  /** Callback when a user is added or the list changes */
  onMembersChanged: () => void;
}

type Mode = "list" | "search" | "create";

interface EditingMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string; // Permission: owner | admin | member | observer
  jobTitle: string; // Fonction: texte libre (Product Owner, Designer, etc.)
  description: string;
}

// Permission options for project members
const PERMISSION_OPTIONS = [
  { value: "owner", label: "Propriétaire" },
  { value: "admin", label: "Administrateur" },
  { value: "member", label: "Membre" },
  { value: "observer", label: "Observateur" },
] as const;

// Suggested job titles for the combobox
const JOB_TITLE_SUGGESTIONS = [
  "Product Owner",
  "Designer UX",
  "Développeur",
  "Consultant",
  "Chef de projet",
  "Sponsor",
  "Expert métier",
  "Architecte",
  "Scrum Master",
] as const;

/**
 * Dialog for managing project participants.
 * - View existing members with edit/delete
 * - Search and add existing users
 * - Create new users and add them
 */
export function ManageProjectParticipantsDialog({
  open,
  onOpenChange,
  projectId,
  askId,
  projectMembers = [],
  onMembersChanged,
}: ManageProjectParticipantsDialogProps) {
  // If askId is provided, we're in "add to ASK" mode - hide list tab and start in search
  const isAskMode = !!askId;
  const [mode, setMode] = useState<Mode>(isAskMode ? "search" : "list");
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

  // Editing member state
  const [editingMember, setEditingMember] = useState<EditingMember | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Current member user IDs for filtering search results
  const currentMemberUserIds = projectMembers.map(m => m.id);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setMode(isAskMode ? "search" : "list");
      setSearchQuery("");
      setSearchResults([]);
      setNewUserEmail("");
      setNewUserFirstName("");
      setNewUserLastName("");
      setNewUserDescription("");
      setError(null);
      setSuccess(null);
      setEditingMember(null);
    }
  }, [open, isAskMode]);

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
        setSuccess("Participant ajouté");
        onMembersChanged();
        // Switch back to list mode after adding
        setTimeout(() => {
          setMode("list");
          setSearchQuery("");
          setSearchResults([]);
          setSuccess(null);
        }, 800);
      } else {
        setError(payload.error || "Erreur lors de l'ajout");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setIsBusy(false);
    }
  }, [projectId, askId, onMembersChanged]);

  // Create new user and add
  const handleCreateAndAdd = useCallback(async () => {
    if (!newUserEmail.trim()) {
      setError("L'email est requis");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail.trim())) {
      setError("Format d'email invalide");
      return;
    }

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
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
          ? "Utilisateur créé et ajouté"
          : "Utilisateur existant ajouté";
        setSuccess(message);
        onMembersChanged();
        // Switch back to list mode after creating
        setTimeout(() => {
          setMode("list");
          setNewUserEmail("");
          setNewUserFirstName("");
          setNewUserLastName("");
          setNewUserDescription("");
          setSuccess(null);
        }, 1000);
      } else {
        setError(payload.error || "Erreur lors de la création");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setIsBusy(false);
    }
  }, [projectId, askId, newUserEmail, newUserFirstName, newUserLastName, newUserDescription, onMembersChanged]);

  // Start editing a member
  const handleStartEdit = useCallback((member: ProjectMember) => {
    setEditingMember({
      id: member.id,
      firstName: member.firstName || "",
      lastName: member.lastName || "",
      email: member.email || "",
      role: member.role || "member",
      jobTitle: member.jobTitle || "",
      description: member.description || "",
    });
    setError(null);
    setSuccess(null);
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingMember(null);
  }, []);

  // Save member changes
  const handleSaveEdit = useCallback(async () => {
    if (!editingMember) return;

    // Basic email validation if email is provided
    if (editingMember.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(editingMember.email.trim())) {
        setError("Format d'email invalide");
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/admin/projects/${projectId}/members/${editingMember.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            firstName: editingMember.firstName.trim(),
            lastName: editingMember.lastName.trim(),
            email: editingMember.email.trim() || undefined,
            role: editingMember.role.trim(),
            jobTitle: editingMember.jobTitle.trim(),
            description: editingMember.description.trim(),
          }),
        }
      );

      const payload = await response.json();

      if (response.ok && payload.success) {
        setSuccess("Modifications enregistrées");
        onMembersChanged();
        setEditingMember(null);
        setTimeout(() => setSuccess(null), 1500);
      } else {
        setError(payload.error || "Erreur lors de la sauvegarde");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setIsSaving(false);
    }
  }, [projectId, editingMember, onMembersChanged]);

  // Remove a member from the project
  const handleRemoveMember = useCallback(async (userId: string, userName: string) => {
    if (!confirm(`Retirer ${userName} du projet ?`)) return;

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/admin/projects/${projectId}/members/${userId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const payload = await response.json();

      if (response.ok && payload.success) {
        setSuccess("Participant retiré");
        onMembersChanged();
        setTimeout(() => setSuccess(null), 1500);
      } else {
        setError(payload.error || "Erreur lors de la suppression");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setIsBusy(false);
    }
  }, [projectId, onMembersChanged]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl my-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-400" />
                  {isAskMode ? "Ajouter un participant" : "Gérer les participants"}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-400 mt-1">
                  {isAskMode
                    ? "Recherchez un utilisateur existant ou créez-en un nouveau"
                    : `${projectMembers.length} participant${projectMembers.length !== 1 ? "s" : ""} dans ce projet`
                  }
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
              {!isAskMode && (
                <button
                  type="button"
                  onClick={() => { setMode("list"); setEditingMember(null); }}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
                    mode === "list"
                      ? "bg-indigo-500 text-white"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Users className="h-4 w-4 inline mr-1.5" />
                  Liste
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("search")}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
                  mode === "search"
                    ? "bg-indigo-500 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Search className="h-4 w-4 inline mr-1.5" />
                {isAskMode ? "Rechercher" : "Ajouter"}
              </button>
              <button
                type="button"
                onClick={() => setMode("create")}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
                  mode === "create"
                    ? "bg-indigo-500 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                <UserPlus className="h-4 w-4 inline mr-1.5" />
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

            {/* List mode - Show existing members */}
            {mode === "list" && (
              <div className="mt-4 space-y-3">
                {projectMembers.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6 text-center">
                    <Users className="h-8 w-8 mx-auto text-slate-500 mb-2" />
                    <p className="text-sm text-slate-400">Aucun participant dans ce projet</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setMode("search")}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Ajouter un participant
                    </Button>
                  </div>
                ) : (
                  <div className="max-h-[350px] overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-slate-900/40 p-2">
                    {projectMembers.map(member => (
                      <article
                        key={member.id}
                        className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 transition"
                      >
                        {editingMember?.id === member.id ? (
                          // Edit mode for this member
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-semibold text-white">
                                {member.fullName || member.email}
                              </h4>
                              <div className="flex gap-1 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10"
                                  onClick={handleSaveEdit}
                                  disabled={isSaving}
                                >
                                  {isSaving ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Save className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                                  onClick={handleCancelEdit}
                                  disabled={isSaving}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs text-slate-400">Prénom</Label>
                                  <Input
                                    type="text"
                                    value={editingMember.firstName}
                                    onChange={e => setEditingMember({ ...editingMember, firstName: e.target.value })}
                                    placeholder="Jean"
                                    className="h-8 text-sm mt-1"
                                    disabled={isSaving}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-400">Nom</Label>
                                  <Input
                                    type="text"
                                    value={editingMember.lastName}
                                    onChange={e => setEditingMember({ ...editingMember, lastName: e.target.value })}
                                    placeholder="Dupont"
                                    className="h-8 text-sm mt-1"
                                    disabled={isSaving}
                                  />
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-slate-400">Email</Label>
                                <Input
                                  type="email"
                                  value={editingMember.email}
                                  onChange={e => setEditingMember({ ...editingMember, email: e.target.value })}
                                  placeholder="email@exemple.com"
                                  className="h-8 text-sm mt-1"
                                  disabled={isSaving}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs text-slate-400">Permission</Label>
                                  <select
                                    value={editingMember.role}
                                    onChange={e => setEditingMember({ ...editingMember, role: e.target.value })}
                                    className="h-8 w-full text-sm mt-1 rounded-md border border-white/10 bg-slate-900/60 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    disabled={isSaving}
                                    title="Ce que l'utilisateur peut faire dans ce projet"
                                  >
                                    {PERMISSION_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-400">Fonction</Label>
                                  <Input
                                    type="text"
                                    list="job-title-suggestions"
                                    value={editingMember.jobTitle}
                                    onChange={e => setEditingMember({ ...editingMember, jobTitle: e.target.value })}
                                    placeholder="Product Owner, Designer..."
                                    className="h-8 text-sm mt-1"
                                    disabled={isSaving}
                                    title="Rôle métier dans ce projet"
                                  />
                                  <datalist id="job-title-suggestions">
                                    {JOB_TITLE_SUGGESTIONS.map(title => (
                                      <option key={title} value={title} />
                                    ))}
                                  </datalist>
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-slate-400">Description (contexte IA)</Label>
                                <Textarea
                                  value={editingMember.description}
                                  onChange={e => {
                                    setEditingMember({ ...editingMember, description: e.target.value });
                                    // Auto-resize
                                    e.target.style.height = "auto";
                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                  }}
                                  onFocus={e => {
                                    // Auto-resize on focus to handle initial content
                                    e.target.style.height = "auto";
                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                  }}
                                  placeholder="Contexte pour personnaliser les échanges IA..."
                                  className="text-sm mt-1 resize-none min-h-[60px] overflow-hidden"
                                  disabled={isSaving}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          // View mode for this member
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-left min-w-0 flex-1">
                              <h4 className="text-sm font-semibold text-white truncate">
                                {member.fullName || member.email}
                              </h4>
                              <p className="text-xs text-slate-400 truncate">{member.email}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {member.role && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                                    {PERMISSION_OPTIONS.find(o => o.value === member.role)?.label || member.role}
                                  </span>
                                )}
                                {member.jobTitle && (
                                  <span className="text-xs text-slate-400">{member.jobTitle}</span>
                                )}
                              </div>
                              {member.description && (
                                <p className="text-xs text-slate-500 italic mt-1 line-clamp-2">
                                  {member.description}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                                onClick={() => handleStartEdit(member)}
                                disabled={isBusy}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => handleRemoveMember(member.id, member.fullName || member.email || "cet utilisateur")}
                                disabled={isBusy}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
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
                    onClick={() => setMode("list")}
                    disabled={isBusy}
                  >
                    Retour
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

