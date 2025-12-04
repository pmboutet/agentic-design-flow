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

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

const gradientButtonClasses = "btn-gradient";

const defaultUserFormValues: UserFormInput = {
  email: "",
  firstName: "",
  lastName: "",
  role: "participant",
  clientId: "",
  isActive: true,
  jobTitle: ""
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const errorMessage = payload.error || payload.message || `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }
  return payload.data as T;
}

export function UsersAdminView() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedUserForProject, setSelectedUserForProject] = useState<ManagedUser | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);

  const userForm = useForm<UserFormInput>({
    resolver: zodResolver(userFormSchema),
    defaultValues: defaultUserFormValues
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersData, clientsData, projectsData] = await Promise.all([
        request<ManagedUser[]>("/api/admin/profiles"),
        request<ClientRecord[]>("/api/admin/clients"),
        request<ProjectRecord[]>("/api/admin/projects")
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
      const data = await request<ManagedUser[]>("/api/admin/profiles");
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
    () => projects.find(p => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const projectsForClient = useMemo(
    () => selectedClientId ? projects.filter(p => p.clientId === selectedClientId) : projects,
    [projects, selectedClientId]
  );

  const filteredUsers = useMemo(() => {
    let result = users;

    if (selectedClientId) {
      // Filter by client but keep admins visible
      result = users.filter(u =>
        u.clientId === selectedClientId ||
        u.role === "full_admin" ||
        u.role === "client_admin"
      );
    }

    // If a project is selected, sort members first
    if (selectedProjectId) {
      const members = result.filter(u => u.projectIds?.includes(selectedProjectId));
      const nonMembers = result.filter(u => !u.projectIds?.includes(selectedProjectId));
      result = [...members, ...nonMembers];
    }

    return result;
  }, [users, selectedClientId, selectedProjectId]);

  const availableUsersForSearch = useMemo(() => {
    if (!selectedProjectId) return [];
    // Users from the same client who are not yet in the project
    const viewingClientId = selectedProject?.clientId ?? selectedClientId;
    return users.filter(u => {
      const isSameClient = u.clientId === viewingClientId;
      const notInProject = !u.projectIds?.includes(selectedProjectId);
      return isSameClient && notInProject;
    });
  }, [users, selectedProjectId, selectedProject, selectedClientId]);

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
        await request(`/api/admin/profiles/${editingUserId}`, {
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
        await request("/api/admin/profiles", {
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
    userForm.reset({
      email: user.email,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      role: (user.role as UserFormInput["role"]) || "participant",
      clientId: user.clientId ?? "",
      isActive: user.isActive,
      jobTitle: user.jobTitle ?? ""
    });
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Delete this user?")) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      await request(`/api/admin/profiles/${userId}`, { method: "DELETE" });
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
      await request(`/api/admin/projects/${selectedProjectId}/members`, {
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
      await request(`/api/admin/projects/${selectedProjectId}/members/${userId}`, {
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
      const newUser = await request<ManagedUser>("/api/admin/profiles", {
        method: "POST",
        body: JSON.stringify({
          email,
          role: "participant",
          isActive: true,
          clientId
        })
      });
      await request(`/api/admin/projects/${selectedProjectId}/members`, {
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

  const handleModalSave = useCallback(async (userId: string, data: UserFormInput) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await request(`/api/admin/profiles/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      });
      await refreshUsers();
      setFeedback({ type: "success", message: "User updated successfully" });
      // Update the editing user with fresh data
      const updatedUsers = await request<ManagedUser[]>("/api/admin/profiles");
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

  const handleAddClientMembership = useCallback(async (userId: string, clientId: string, role: ClientRole) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await request(`/api/admin/clients/${clientId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId, role })
      });
      await refreshUsers();
      setFeedback({ type: "success", message: "User added to client" });
      // Update the editing user with fresh data
      const updatedUsers = await request<ManagedUser[]>("/api/admin/profiles");
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

  const handleUpdateClientMembership = useCallback(async (userId: string, clientId: string, role: ClientRole) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await request(`/api/admin/clients/${clientId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId, role })
      });
      await refreshUsers();
      setFeedback({ type: "success", message: "Client role updated" });
      // Update the editing user with fresh data
      const updatedUsers = await request<ManagedUser[]>("/api/admin/profiles");
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

  const handleRemoveClientMembership = useCallback(async (userId: string, clientId: string) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await request(`/api/admin/clients/${clientId}/members/${userId}`, {
        method: "DELETE"
      });
      await refreshUsers();
      setFeedback({ type: "success", message: "User removed from client" });
      // Update the editing user with fresh data
      const updatedUsers = await request<ManagedUser[]>("/api/admin/profiles");
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

  const handleModalAddProjectMembership = useCallback(async (userId: string, projectId: string) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await request(`/api/admin/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId })
      });
      await refreshUsers();
      setFeedback({ type: "success", message: "User added to project" });
      // Update the editing user with fresh data
      const updatedUsers = await request<ManagedUser[]>("/api/admin/profiles");
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

  const handleModalRemoveProjectMembership = useCallback(async (userId: string, projectId: string) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await request(`/api/admin/projects/${projectId}/members/${userId}`, {
        method: "DELETE"
      });
      await refreshUsers();
      setFeedback({ type: "success", message: "User removed from project" });
      // Update the editing user with fresh data
      const updatedUsers = await request<ManagedUser[]>("/api/admin/profiles");
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
            <button type="button" onClick={() => setFeedback(null)} className="p-1 hover:opacity-70">
              <X className="h-4 w-4" />
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Client Filter */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-indigo-300" />
            <Label className="text-sm font-medium text-white">Filter by Client</Label>
          </div>
          <select
            className="w-full h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
            value={selectedClientId ?? ""}
            onChange={e => {
              setSelectedClientId(e.target.value || null);
              setSelectedProjectId(null);
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

        {/* Project Filter */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FolderKanban className="h-4 w-4 text-purple-300" />
            <Label className="text-sm font-medium text-white">Filter by Project</Label>
          </div>
          <select
            className="w-full h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
            value={selectedProjectId ?? ""}
            onChange={e => setSelectedProjectId(e.target.value || null)}
          >
            <option value="">All projects</option>
            {projectsForClient.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>

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
                Members of {selectedProject.name} appear first, with other client users ready to add.
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
                {availableUsersForSearch.length === 0 && (
                  <p className="text-xs text-slate-400">
                    No available users. You need access to a client to see its users.
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
                          : user.clientName || "No client assigned"}
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
