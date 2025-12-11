"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  FolderKanban,
  Loader2,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ClientMembership,
  ClientRecord,
  ClientRole,
  ManagedUser,
  ProjectMembership,
  ProjectRecord,
} from "@/types";

// Role definitions with descriptions
const globalRoles = [
  { value: "full_admin", label: "Full Admin", description: "All access across all clients/projects" },
  { value: "client_admin", label: "Client Admin", description: "Manages all projects and users for assigned clients" },
  { value: "facilitator", label: "Facilitator", description: "Manages projects, creates/updates contacts" },
  { value: "manager", label: "Manager", description: "Manages clients, creates/updates contacts" },
  { value: "participant", label: "Participant", description: "Basic user access" },
] as const;

const clientRoles = [
  { value: "client_admin", label: "Client Admin", description: "Full access within this client" },
  { value: "facilitator", label: "Facilitator", description: "Manages projects for this client" },
  { value: "manager", label: "Manager", description: "Manages this client" },
  { value: "participant", label: "Participant", description: "Basic access" },
] as const;

const userFormSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  role: z.enum(["full_admin", "client_admin", "facilitator", "manager", "participant"]).default("participant"),
  jobTitle: z.string().trim().max(255).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

type UserFormInput = z.infer<typeof userFormSchema>;

interface UserEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: ManagedUser | null;
  clients: ClientRecord[];
  projects: ProjectRecord[];
  onSave: (userId: string, data: UserFormInput) => Promise<void>;
  onAddClientMembership: (userId: string, clientId: string, role: ClientRole) => Promise<void>;
  onUpdateClientMembership: (userId: string, clientId: string, role: ClientRole) => Promise<void>;
  onRemoveClientMembership: (userId: string, clientId: string) => Promise<void>;
  onAddProjectMembership: (userId: string, projectId: string) => Promise<void>;
  onRemoveProjectMembership: (userId: string, projectId: string) => Promise<void>;
  isBusy: boolean;
}

export function UserEditModal({
  open,
  onOpenChange,
  user,
  clients,
  projects,
  onSave,
  onAddClientMembership,
  onUpdateClientMembership,
  onRemoveClientMembership,
  onAddProjectMembership,
  onRemoveProjectMembership,
  isBusy,
}: UserEditModalProps) {
  const [selectedNewClientId, setSelectedNewClientId] = useState<string>("");
  const [selectedNewClientRole, setSelectedNewClientRole] = useState<ClientRole>("participant");
  const [selectedNewProjectId, setSelectedNewProjectId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"details" | "clients" | "projects">("details");

  const form = useForm<UserFormInput>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "participant",
      jobTitle: "",
      description: "",
      isActive: true,
    },
  });

  // Reset form when user changes
  useEffect(() => {
    if (user) {
      form.reset({
        email: user.email,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        role: (user.role as UserFormInput["role"]) || "participant",
        jobTitle: user.jobTitle ?? "",
        description: user.description ?? "",
        isActive: user.isActive,
      });
    }
  }, [user, form]);

  const handleSubmit = async (values: UserFormInput) => {
    if (!user) return;
    await onSave(user.id, values);
  };

  const handleAddClientMembership = useCallback(async () => {
    if (!user || !selectedNewClientId) return;
    await onAddClientMembership(user.id, selectedNewClientId, selectedNewClientRole);
    setSelectedNewClientId("");
    setSelectedNewClientRole("participant");
  }, [user, selectedNewClientId, selectedNewClientRole, onAddClientMembership]);

  const handleAddProjectMembership = useCallback(async () => {
    if (!user || !selectedNewProjectId) return;
    await onAddProjectMembership(user.id, selectedNewProjectId);
    setSelectedNewProjectId("");
  }, [user, selectedNewProjectId, onAddProjectMembership]);

  // Get available clients (not already assigned)
  const availableClients = clients.filter(
    (client) => !user?.clientMemberships?.some((cm) => cm.clientId === client.id)
  );

  // Get available projects (not already assigned)
  const availableProjects = projects.filter(
    (project) => !user?.projectMemberships?.some((pm) => pm.projectId === project.id)
  );

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-400" />
            Edit User: {user.fullName || user.email}
          </DialogTitle>
          <DialogDescription>
            Manage user details, client assignments, and project memberships.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-white/10 -mx-6 px-6">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "details"
                ? "text-indigo-300 border-b-2 border-indigo-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("clients")}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "clients"
                ? "text-indigo-300 border-b-2 border-indigo-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Clients ({user.clientMemberships?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("projects")}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "projects"
                ? "text-indigo-300 border-b-2 border-indigo-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FolderKanban className="h-4 w-4" />
            Projects ({user.projectMemberships?.length || 0})
          </button>
        </div>

        {/* Details Tab */}
        {activeTab === "details" && (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@company.com"
                  {...form.register("email")}
                  disabled={isBusy}
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-red-400">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  {...form.register("firstName")}
                  disabled={isBusy}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  {...form.register("lastName")}
                  disabled={isBusy}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="jobTitle">Job Title</Label>
                <Input
                  id="jobTitle"
                  placeholder="e.g. Product Manager"
                  {...form.register("jobTitle")}
                  disabled={isBusy}
                />
              </div>

              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  placeholder="Brief description of this user..."
                  {...form.register("description")}
                  disabled={isBusy}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
                <p className="text-xs text-slate-400">
                  Max 2000 characters
                </p>
              </div>

              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="role">Global Role</Label>
                <select
                  id="role"
                  className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                  {...form.register("role")}
                  disabled={isBusy}
                >
                  {globalRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} - {role.description}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">
                  This is the user&apos;s global role. They may have different roles per client.
                </p>
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  id="isActive"
                  {...form.register("isActive")}
                  disabled={isBusy}
                  className="h-4 w-4 rounded border-white/10 bg-slate-900/60"
                />
                <Label htmlFor="isActive" className="cursor-pointer">
                  User is active
                </Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
              <Button
                type="button"
                variant="glassDark"
                onClick={() => onOpenChange(false)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" className="btn-gradient" disabled={isBusy}>
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          </form>
        )}

        {/* Clients Tab */}
        {activeTab === "clients" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Assign this user to clients with specific roles. A user can have different roles in different clients.
            </p>

            {/* Add new client membership */}
            <div className="flex gap-2 items-end p-3 rounded-xl border border-white/10 bg-slate-900/40">
              <div className="flex-1">
                <Label htmlFor="newClient" className="text-xs">Add to Client</Label>
                <select
                  id="newClient"
                  className="w-full h-9 rounded-lg border border-white/10 bg-slate-900/60 px-2 text-sm text-white"
                  value={selectedNewClientId}
                  onChange={(e) => setSelectedNewClientId(e.target.value)}
                  disabled={isBusy || availableClients.length === 0}
                >
                  <option value="">Select a client...</option>
                  {availableClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-40">
                <Label htmlFor="newClientRole" className="text-xs">Role</Label>
                <select
                  id="newClientRole"
                  className="w-full h-9 rounded-lg border border-white/10 bg-slate-900/60 px-2 text-sm text-white"
                  value={selectedNewClientRole}
                  onChange={(e) => setSelectedNewClientRole(e.target.value as ClientRole)}
                  disabled={isBusy || !selectedNewClientId}
                >
                  {clientRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                className="btn-gradient h-9"
                onClick={handleAddClientMembership}
                disabled={isBusy || !selectedNewClientId}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Current client memberships */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {(!user.clientMemberships || user.clientMemberships.length === 0) ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No client assignments yet.
                </p>
              ) : (
                user.clientMemberships.map((membership) => (
                  <ClientMembershipCard
                    key={membership.id}
                    membership={membership}
                    onUpdateRole={(role) => onUpdateClientMembership(user.id, membership.clientId, role)}
                    onRemove={() => onRemoveClientMembership(user.id, membership.clientId)}
                    isBusy={isBusy}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Projects Tab */}
        {activeTab === "projects" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Assign this user to projects. Projects are organized by client.
            </p>

            {/* Add new project membership */}
            <div className="flex gap-2 items-end p-3 rounded-xl border border-white/10 bg-slate-900/40">
              <div className="flex-1">
                <Label htmlFor="newProject" className="text-xs">Add to Project</Label>
                <select
                  id="newProject"
                  className="w-full h-9 rounded-lg border border-white/10 bg-slate-900/60 px-2 text-sm text-white"
                  value={selectedNewProjectId}
                  onChange={(e) => setSelectedNewProjectId(e.target.value)}
                  disabled={isBusy || availableProjects.length === 0}
                >
                  <option value="">Select a project...</option>
                  {availableProjects.map((project) => {
                    const client = clients.find((c) => c.id === project.clientId);
                    return (
                      <option key={project.id} value={project.id}>
                        {project.name} ({client?.name || "Unknown client"})
                      </option>
                    );
                  })}
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                className="btn-gradient h-9"
                onClick={handleAddProjectMembership}
                disabled={isBusy || !selectedNewProjectId}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Current project memberships */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {(!user.projectMemberships || user.projectMemberships.length === 0) ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No project assignments yet.
                </p>
              ) : (
                user.projectMemberships.map((membership) => (
                  <ProjectMembershipCard
                    key={membership.id}
                    membership={membership}
                    onRemove={() => onRemoveProjectMembership(user.id, membership.projectId)}
                    isBusy={isBusy}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Client membership card component
function ClientMembershipCard({
  membership,
  onUpdateRole,
  onRemove,
  isBusy,
}: {
  membership: ClientMembership;
  onUpdateRole: (role: ClientRole) => void;
  onRemove: () => void;
  isBusy: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-slate-900/40">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20">
          <Building2 className="h-4 w-4 text-indigo-300" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{membership.clientName}</p>
          {membership.jobTitle && (
            <p className="text-xs text-slate-400 truncate">{membership.jobTitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select
          className="h-8 rounded-lg border border-white/10 bg-slate-900/60 px-2 text-xs text-white"
          value={membership.role}
          onChange={(e) => onUpdateRole(e.target.value as ClientRole)}
          disabled={isBusy}
        >
          {clientRoles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={onRemove}
          disabled={isBusy}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          <span className="text-xs">Retirer</span>
        </Button>
      </div>
    </div>
  );
}

// Project membership card component
function ProjectMembershipCard({
  membership,
  onRemove,
  isBusy,
}: {
  membership: ProjectMembership;
  onRemove: () => void;
  isBusy: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-slate-900/40">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20">
          <FolderKanban className="h-4 w-4 text-purple-300" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{membership.projectName}</p>
          <p className="text-xs text-slate-400 truncate">
            {membership.clientName || "Unknown client"}
            {membership.projectStatus && (
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase ${
                membership.projectStatus === "active"
                  ? "bg-green-500/20 text-green-300"
                  : "bg-slate-500/20 text-slate-300"
              }`}>
                {membership.projectStatus}
              </span>
            )}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
        onClick={onRemove}
        disabled={isBusy}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        <span className="text-xs">Retirer</span>
      </Button>
    </div>
  );
}
