"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  FolderKanban,
  Loader2,
  RefreshCcw,
  Users,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserSearchCombobox } from "@/components/ui/user-search-combobox";
import { UserEditModal } from "@/components/admin/UserEditModal";
import { useClientContext } from "@/components/admin/ClientContext";
import { useProjectContext } from "@/components/admin/ProjectContext";
import { useAuth } from "@/components/auth/AuthProvider";
import { adminRequest, type FeedbackState } from "@/components/admin/useAdminResources";
import { formatDateTime } from "@/components/admin/dashboard/utils";
import { gradientButtonClasses } from "@/components/admin/dashboard/constants";
import type { ClientRecord, ClientRole, ManagedUser, ProjectRecord } from "@/types";

const userRoles = ["full_admin", "client_admin", "facilitator", "manager", "participant"] as const;

const userFormSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  role: z.enum(userRoles).default("participant"),
  clientId: z.string().trim().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  jobTitle: z.string().trim().max(255).optional().or(z.literal(""))
});

type UserFormInput = z.infer<typeof userFormSchema>;

const defaultUserFormValues: UserFormInput = {
  email: "",
  firstName: "",
  lastName: "",
  role: "participant",
  clientId: "",
  isActive: true,
  jobTitle: ""
};

export function UsersAdminView() {
  // Get current user's role flags from auth context
  const { isFullAdmin } = useAuth();

  // Get global client selection from context
  const { selectedClientId: contextClientId, clients: contextClients } = useClientContext();
  // Get global project selection from context
  const { selectedProjectId: contextProjectId, selectedProject: contextSelectedProject } = useProjectContext();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  // Local filter only used when contextClientId is "all"
  const [localClientFilter, setLocalClientFilter] = useState<string | null>(null);
  // Local project filter only used when contextProjectId is "all"
  const [localProjectFilter, setLocalProjectFilter] = useState<string | null>(null);
  const [selectedUserForProject, setSelectedUserForProject] = useState<ManagedUser | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);

  // Effective client ID: use context selection if specific, otherwise use local filter
  const isContextClientSpecific = contextClientId !== "all";
  const selectedClientId = isContextClientSpecific ? contextClientId : localClientFilter;

  // Effective project ID: use context selection if specific, otherwise use local filter
  const isContextProjectSpecific = contextProjectId !== "all";
  const selectedProjectId = isContextProjectSpecific ? contextProjectId : localProjectFilter;

  // Reset local filters when context client or project changes
  useEffect(() => {
    setLocalClientFilter(null);
    setLocalProjectFilter(null);
  }, [contextClientId, contextProjectId]);

  const userForm = useForm<UserFormInput>({
    resolver: zodResolver(userFormSchema),
    defaultValues: defaultUserFormValues
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersData, clientsData, projectsData] = await Promise.all([
        adminRequest<ManagedUser[]>("/api/admin/profiles"),
        adminRequest<ClientRecord[]>("/api/admin/clients"),
        adminRequest<ProjectRecord[]>("/api/admin/projects")
      ]);
      setUsers(usersData ?? []);
      setClients(clientsData ?? []);
      setProjects(projectsData ?? []);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to load data"
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshUsers = useCallback(async () => {
    try {
      const data = await adminRequest<ManagedUser[]>("/api/admin/profiles");
      setUsers(data ?? []);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to refresh users"
      });
    }
  }, []);

  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  const selectedProject = useMemo(
    () => contextSelectedProject ?? projects.find(p => p.id === selectedProjectId) ?? null,
    [contextSelectedProject, projects, selectedProjectId]
  );

  const projectsForClient = useMemo(
    () => selectedClientId ? projects.filter(p => p.clientId === selectedClientId) : projects,
    [projects, selectedClientId]
  );

  const filteredUsers = useMemo(() => {
    let result = users;

    if (selectedClientId) {
      // Filter by client (check ALL memberships) but keep admins visible
      result = users.filter(u =>
        u.clientMemberships?.some(cm => cm.clientId === selectedClientId) ||
        u.role === "full_admin" ||
        u.role === "client_admin"
      );
    }

    // If a project is selected, filter to only show project members
    if (selectedProjectId) {
      result = result.filter(u => u.projectIds?.includes(selectedProjectId));
    }

    return result;
  }, [users, selectedClientId, selectedProjectId]);

  const availableUsersForSearch = useMemo(() => {
    if (!selectedProjectId) return [];

    // Users who are not yet in the project
    const notInProjectUsers = users.filter(u => !u.projectIds?.includes(selectedProjectId));

    // Full admin can add any user not already in the project
    if (isFullAdmin) {
      return notInProjectUsers;
    }

    // Client admin can add users from any of their authorized clients
    // contextClients contains only clients the current admin has access to
    const authorizedClientIds = contextClients.map(c => c.id);
    return notInProjectUsers.filter(u => {
      // Check if user has membership in any of the admin's authorized clients
      return u.clientMemberships?.some(cm => authorizedClientIds.includes(cm.clientId));
    });
  }, [users, selectedProjectId, isFullAdmin, contextClients]);

  const resetUserForm = useCallback(() => {
    userForm.reset({ ...defaultUserFormValues, clientId: selectedClientId ?? "" });
    setEditingUserId(null);
  }, [userForm, selectedClientId]);

  const cancelUserEdit = useCallback(() => {
    resetUserForm();
    setSelectedUserForProject(null);
    setEditingUserId(null);
    setShowUserForm(false);
  }, [resetUserForm]);

  const handleSubmitUser = async (values: UserFormInput) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      if (editingUserId) {
        await adminRequest(`/api/admin/profiles/${editingUserId}`, {
          method: "PATCH",
          body: JSON.stringify(values)
        });
        setFeedback({ type: "success", message: "User updated successfully" });
      } else {
        if (!values.clientId && !selectedClientId) {
          setFeedback({ type: "error", message: "Please select a client before creating a user" });
          return;
        }
        const payload = { ...values, clientId: values.clientId || selectedClientId };
        await adminRequest("/api/admin/profiles", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setFeedback({ type: "success", message: "User created successfully" });
      }
      await refreshUsers();
      resetUserForm();
      setEditingUserId(null);
      setShowUserForm(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsBusy(false);
    }
  };

  const startUserEdit = (userId: string) => {
    const user = users.find(item => item.id === userId);
    if (!user) return;
    setShowUserForm(true);
    setEditingUserId(user.id);
    // Use selected client from context, or find if user belongs to it, or fall back to first membership
    const contextClientMembership = user.clientMemberships?.find(cm => cm.clientId === selectedClientId);
    const defaultClientId = contextClientMembership?.clientId ?? user.clientMemberships?.[0]?.clientId ?? "";
    userForm.reset({
      email: user.email,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      role: (user.role as UserFormInput["role"]) || "participant",
      clientId: defaultClientId,
      isActive: user.isActive,
      jobTitle: user.jobTitle ?? ""
    });
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Delete this user?")) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      await adminRequest(`/api/admin/profiles/${userId}`, { method: "DELETE" });
      await refreshUsers();
      setFeedback({ type: "success", message: "User deleted successfully" });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddUserToProject = async (userId: string) => {
    if (!selectedProjectId) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      await adminRequest(`/api/admin/projects/${selectedProjectId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId })
      });
      await refreshUsers();
      setFeedback({ type: "success", message: "User added to project" });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveUserFromProject = async (userId: string) => {
    if (!selectedProjectId) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      await adminRequest(`/api/admin/projects/${selectedProjectId}/members/${userId}`, {
        method: "DELETE"
      });
      await refreshUsers();
      setFeedback({ type: "success", message: "User removed from project" });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleUserSelectedForProject = async (user: ManagedUser | null) => {
    if (!user || !selectedProjectId) {
      setSelectedUserForProject(null);
      return;
    }
    await handleAddUserToProject(user.id);
    setSelectedUserForProject(null);
    setShowUserForm(false);
  };

  const handleCreateNewUserForProject = async (email: string) => {
    if (!selectedProjectId) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      const clientId = selectedProject?.clientId ?? selectedClientId ?? undefined;
      const newUser = await adminRequest<ManagedUser>("/api/admin/profiles", {
        method: "POST",
        body: JSON.stringify({
          email,
          role: "participant",
          isActive: true,
          clientId
        })
      });
      await adminRequest(`/api/admin/projects/${selectedProjectId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: newUser.id })
      });
      await refreshUsers();
      setSelectedUserForProject(null);
      setShowUserForm(false);
      setFeedback({ type: "success", message: "User created and added to project" });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsBusy(false);
    }
  };

  const viewingClientId = selectedProject?.clientId ?? selectedClientId;

  // Modal handlers
  const openEditModal = useCallback((user: ManagedUser) => {
    setEditingUser(user);
    setEditModalOpen(true);
  }, []);

  // DRY: Shared wrapper for modal actions that refresh users and update editing user
  const withModalAction = useCallback(async (
    action: () => Promise<unknown>,
    successMessage: string,
    userId: string
  ) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await action();
      await refreshUsers();
      setFeedback({ type: "success", message: successMessage });
      const updatedUsers = await adminRequest<ManagedUser[]>("/api/admin/profiles");
      const updatedUser = updatedUsers.find(u => u.id === userId);
      if (updatedUser) {
        setEditingUser(updatedUser);
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsBusy(false);
    }
  }, [refreshUsers]);

  const handleModalSave = useCallback(async (userId: string, data: UserFormInput) => {
    await withModalAction(
      () => adminRequest(`/api/admin/profiles/${userId}`, { method: "PATCH", body: JSON.stringify(data) }),
      "User updated successfully",
      userId
    );
  }, [withModalAction]);

  const handleAddClientMembership = useCallback(async (userId: string, clientId: string, role: ClientRole) => {
    await withModalAction(
      () => adminRequest(`/api/admin/clients/${clientId}/members`, { method: "POST", body: JSON.stringify({ userId, role }) }),
      "User added to client",
      userId
    );
  }, [withModalAction]);

  const handleUpdateClientMembership = useCallback(async (userId: string, clientId: string, role: ClientRole) => {
    await withModalAction(
      () => adminRequest(`/api/admin/clients/${clientId}/members`, { method: "POST", body: JSON.stringify({ userId, role }) }),
      "Client role updated",
      userId
    );
  }, [withModalAction]);

  const handleRemoveClientMembership = useCallback(async (userId: string, clientId: string) => {
    await withModalAction(
      () => adminRequest(`/api/admin/clients/${clientId}/members/${userId}`, { method: "DELETE" }),
      "User removed from client",
      userId
    );
  }, [withModalAction]);

  const handleModalAddProjectMembership = useCallback(async (userId: string, projectId: string) => {
    await withModalAction(
      () => adminRequest(`/api/admin/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ userId }) }),
      "User added to project",
      userId
    );
  }, [withModalAction]);

  const handleModalRemoveProjectMembership = useCallback(async (userId: string, projectId: string) => {
    await withModalAction(
      () => adminRequest(`/api/admin/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
      "User removed from project",
      userId
    );
  }, [withModalAction]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">User Management</h1>
          <p className="text-sm text-slate-300">
            Create, edit, and manage users. Assign them to clients and projects.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Feedback */}
      {feedback && (
        <Alert
          className={
            feedback.type === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-200"
              : "border-red-500/40 bg-red-500/10 text-red-200"
          }
        >
          <AlertDescription className="flex items-center justify-between">
            <span>{feedback.message}</span>
            <button type="button" onClick={() => setFeedback(null)} className="p-1 hover:opacity-70 flex items-center gap-1 text-xs">
              <X className="h-4 w-4" />
              <span>Fermer</span>
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Filters - only show when "all" is selected in sidebar for respective filter */}
      {(!isContextClientSpecific || !isContextProjectSpecific) && (
        <div className={`grid gap-4 ${!isContextClientSpecific && !isContextProjectSpecific ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
          {/* Client Filter - only show when "all" is selected in sidebar */}
          {!isContextClientSpecific && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-indigo-300" />
                <Label className="text-sm font-medium text-white">Filter by Client</Label>
              </div>
              <select
                className="w-full h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                value={localClientFilter ?? ""}
                onChange={e => {
                  setLocalClientFilter(e.target.value || null);
                  setLocalProjectFilter(null);
                }}
              >
                <option value="">All clients</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Project Filter - only show when "all" is selected in sidebar */}
          {!isContextProjectSpecific && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <FolderKanban className="h-4 w-4 text-purple-300" />
                <Label className="text-sm font-medium text-white">Filter by Project</Label>
              </div>
              <select
                className="w-full h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                value={localProjectFilter ?? ""}
                onChange={e => setLocalProjectFilter(e.target.value || null)}
              >
                <option value="">All projects</option>
                {projectsForClient.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Users Section */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-300" />
              <h3 className="text-lg font-semibold text-white">Users</h3>
            </div>
            <p className="text-xs text-slate-400">
              {selectedClient
                ? `Directory for ${selectedClient.name}. Admins stay visible regardless of client.`
                : "Directory across all clients. Admins stay visible for quick access."}
            </p>
            {selectedProject && (
              <p className="text-[11px] text-slate-500">
                Showing members of {selectedProject.name} only.
              </p>
            )}
          </div>
          <Button
            type="button"
            className={`${gradientButtonClasses} h-9 px-4 text-xs`}
            onClick={() => {
              if (showUserForm) {
                cancelUserEdit();
              } else {
                resetUserForm();
                setShowUserForm(true);
              }
            }}
            disabled={isBusy}
          >
            {showUserForm ? "Close" : "Add user"}
          </Button>
        </header>

        {/* User Form */}
        {showUserForm && (
          <>
            {editingUserId ? (
              <form
                onSubmit={userForm.handleSubmit(handleSubmitUser)}
                className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 mb-4"
              >
                <p className="text-xs font-medium text-amber-300">
                  Editing {users.find(user => user.id === editingUserId)?.fullName || users.find(user => user.id === editingUserId)?.email}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="user-email">Email</Label>
                    <Input
                      id="user-email"
                      type="email"
                      placeholder="user@company.com"
                      {...userForm.register("email")}
                      disabled={isBusy}
                    />
                    {userForm.formState.errors.email && (
                      <p className="text-xs text-red-400">{userForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="user-firstname">First name</Label>
                    <Input
                      id="user-firstname"
                      placeholder="John"
                      {...userForm.register("firstName")}
                      disabled={isBusy}
                    />
                    {userForm.formState.errors.firstName && (
                      <p className="text-xs text-red-400">{userForm.formState.errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="user-lastname">Last name</Label>
                    <Input
                      id="user-lastname"
                      placeholder="Doe"
                      {...userForm.register("lastName")}
                      disabled={isBusy}
                    />
                    {userForm.formState.errors.lastName && (
                      <p className="text-xs text-red-400">{userForm.formState.errors.lastName.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="user-job-title">Job Title</Label>
                    <Input
                      id="user-job-title"
                      placeholder="e.g. Product Manager"
                      {...userForm.register("jobTitle")}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="user-role">Role</Label>
                    <select
                      id="user-role"
                      className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                      {...userForm.register("role")}
                      disabled={isBusy}
                    >
                      <option value="full_admin">Full Admin</option>
                      <option value="client_admin">Client Admin</option>
                      <option value="facilitator">Facilitator</option>
                      <option value="manager">Manager</option>
                      <option value="participant">Participant</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="user-client">Client</Label>
                    <select
                      id="user-client"
                      className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                      {...userForm.register("clientId")}
                      disabled={isBusy}
                    >
                      <option value="">No client</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="glassDark"
                    onClick={cancelUserEdit}
                    disabled={isBusy}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Update user
                  </Button>
                </div>
              </form>
            ) : selectedProjectId ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 mb-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="add-user-search">Search for a user to add to project</Label>
                  <UserSearchCombobox
                    users={availableUsersForSearch}
                    selectedUserId={selectedUserForProject?.id ?? null}
                    onSelect={handleUserSelectedForProject}
                    onCreateNew={handleCreateNewUserForProject}
                    placeholder="Search by name, email or job title..."
                    disabled={isBusy}
                  />
                </div>
                {availableUsersForSearch.length === 0 && viewingClientId && (
                  <p className="text-xs text-slate-400">
                    All users from this client are already in the project. You can create a new user above.
                  </p>
                )}
                {availableUsersForSearch.length === 0 && !viewingClientId && (
                  <p className="text-xs text-slate-400">
                    No available users. Select a client to see its users.
                  </p>
                )}
              </div>
            ) : (
              <form
                onSubmit={userForm.handleSubmit(handleSubmitUser)}
                className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 mb-4"
              >
                <p className="text-xs font-medium text-indigo-300">Create new user</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-user-email">Email</Label>
                    <Input
                      id="new-user-email"
                      type="email"
                      placeholder="user@company.com"
                      {...userForm.register("email")}
                      disabled={isBusy}
                    />
                    {userForm.formState.errors.email && (
                      <p className="text-xs text-red-400">{userForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-user-firstname">First name</Label>
                    <Input
                      id="new-user-firstname"
                      placeholder="John"
                      {...userForm.register("firstName")}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-user-lastname">Last name</Label>
                    <Input
                      id="new-user-lastname"
                      placeholder="Doe"
                      {...userForm.register("lastName")}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-user-job-title">Job Title</Label>
                    <Input
                      id="new-user-job-title"
                      placeholder="e.g. Product Manager"
                      {...userForm.register("jobTitle")}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-user-role">Role</Label>
                    <select
                      id="new-user-role"
                      className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                      {...userForm.register("role")}
                      disabled={isBusy}
                    >
                      <option value="full_admin">Full Admin</option>
                      <option value="client_admin">Client Admin</option>
                      <option value="facilitator">Facilitator</option>
                      <option value="manager">Manager</option>
                      <option value="participant">Participant</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-user-client">Client</Label>
                    <select
                      id="new-user-client"
                      className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                      {...userForm.register("clientId")}
                      disabled={isBusy}
                    >
                      <option value="">Select a client</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="glassDark"
                    onClick={cancelUserEdit}
                    disabled={isBusy}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Create user
                  </Button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Users List */}
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
          {isLoading && filteredUsers.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-300 py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No users available in this directory yet.</p>
          ) : (
            filteredUsers.map(user => {
              const projectIds = user.projectIds ?? [];
              const isMemberOfSelectedProject = selectedProjectId ? projectIds.includes(selectedProjectId) : false;

              return (
                <article
                  key={user.id}
                  className={`rounded-2xl border px-4 py-3 transition hover:border-indigo-400 ${
                    user.id === editingUserId
                      ? "border-indigo-400 bg-indigo-500/10"
                      : "border-white/10 bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h4 className="text-sm font-semibold text-white">{user.fullName || user.email}</h4>
                      <p className="text-xs text-slate-400">{user.email}</p>
                      {user.jobTitle && (
                        <p className="text-xs text-slate-500 italic">{user.jobTitle}</p>
                      )}
                      <p className="text-[11px] text-slate-500">
                        {user.clientMemberships && user.clientMemberships.length > 0
                          ? `${user.clientMemberships.length} client${user.clientMemberships.length > 1 ? 's' : ''}`
                          : user.clientMemberships?.[0]?.clientName || "No client assigned"}
                        {user.projectMemberships && user.projectMemberships.length > 0 && (
                          <span className="ml-1.5">
                            • {user.projectMemberships.length} project{user.projectMemberships.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">
                        {user.role}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-wide ${
                        user.isActive ? "bg-green-500/20 text-green-300" : "bg-slate-500/20 text-slate-300"
                      }`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  {selectedProjectId && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className={isMemberOfSelectedProject ? "text-indigo-200" : undefined}>
                        {isMemberOfSelectedProject
                          ? `Assigned to ${selectedProject?.name ?? "project"}`
                          : "Not assigned to this project"}
                      </span>
                      <Button
                        type="button"
                        variant={isMemberOfSelectedProject ? "glassDark" : "secondary"}
                        size="sm"
                        className="h-7 px-3 text-[11px]"
                        onClick={() => {
                          if (isMemberOfSelectedProject) {
                            void handleRemoveUserFromProject(user.id);
                          } else {
                            void handleAddUserToProject(user.id);
                          }
                        }}
                        disabled={isBusy}
                      >
                        {isMemberOfSelectedProject ? "Remove from project" : "Add to project"}
                      </Button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Joined {formatDateTime(user.createdAt)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="text-slate-200 hover:text-white"
                        disabled={isBusy}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(user.id)}
                        className="text-red-300 hover:text-red-200"
                        disabled={isBusy}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      {/* User Edit Modal */}
      <UserEditModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        user={editingUser}
        clients={clients}
        projects={projects}
        onSave={handleModalSave}
        onAddClientMembership={handleAddClientMembership}
        onUpdateClientMembership={handleUpdateClientMembership}
        onRemoveClientMembership={handleRemoveClientMembership}
        onAddProjectMembership={handleModalAddProjectMembership}
        onRemoveProjectMembership={handleModalRemoveProjectMembership}
        isBusy={isBusy}
      />
    </div>
  );
}
