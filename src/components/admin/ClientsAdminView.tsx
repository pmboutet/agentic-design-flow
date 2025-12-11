"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  Edit,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientRecord } from "@/types";

const clientFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  company: z.string().trim().max(255).optional().or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active")
});

type ClientFormInput = z.infer<typeof clientFormSchema>;

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

const gradientButtonClasses = "btn-gradient";

const defaultClientFormValues: ClientFormInput = {
  name: "",
  email: "",
  company: "",
  industry: "",
  status: "active"
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

export function ClientsAdminView() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  const clientForm = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: defaultClientFormValues
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const clientsData = await request<ClientRecord[]>("/api/admin/clients");
      setClients(clientsData ?? []);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to load clients"
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshClients = useCallback(async () => {
    try {
      const data = await request<ClientRecord[]>("/api/admin/clients");
      setClients(data ?? []);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to refresh clients"
      });
    }
  }, []);

  const resetClientForm = useCallback(() => {
    clientForm.reset(defaultClientFormValues);
    setEditingClientId(null);
  }, [clientForm]);

  const cancelClientEdit = useCallback(() => {
    resetClientForm();
    setEditingClientId(null);
    setShowClientForm(false);
  }, [resetClientForm]);

  const handleSubmitClient = async (values: ClientFormInput) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      if (editingClientId) {
        await request(`/api/admin/clients/${editingClientId}`, {
          method: "PATCH",
          body: JSON.stringify(values)
        });
        setFeedback({ type: "success", message: "Client updated successfully" });
      } else {
        await request("/api/admin/clients", {
          method: "POST",
          body: JSON.stringify(values)
        });
        setFeedback({ type: "success", message: "Client created successfully" });
      }
      await refreshClients();
      resetClientForm();
      setEditingClientId(null);
      setShowClientForm(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsBusy(false);
    }
  };

  const startClientEdit = (clientId: string) => {
    const client = clients.find(item => item.id === clientId);
    if (!client) return;
    setShowClientForm(true);
    setEditingClientId(client.id);
    clientForm.reset({
      name: client.name,
      email: client.email ?? "",
      company: client.company ?? "",
      industry: client.industry ?? "",
      status: (client.status as "active" | "inactive") || "active"
    });
  };

  const handleDeleteClient = async (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!window.confirm(`Delete client "${client?.name}"? This action cannot be undone.`)) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      await request(`/api/admin/clients/${clientId}`, { method: "DELETE" });
      await refreshClients();
      setFeedback({ type: "success", message: "Client deleted successfully" });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Client Management</h1>
          <p className="text-sm text-slate-300">
            Create, edit, and manage clients. Clients can have projects and users associated with them.
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
              <span>Close</span>
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Clients Section */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-300" />
              <h3 className="text-lg font-semibold text-white">Clients</h3>
            </div>
            <p className="text-xs text-slate-400">
              Manage your organization&apos;s client accounts.
            </p>
          </div>
          <Button
            type="button"
            className={`${gradientButtonClasses} h-9 px-4 text-xs gap-2`}
            onClick={() => {
              if (showClientForm) {
                cancelClientEdit();
              } else {
                resetClientForm();
                setShowClientForm(true);
              }
            }}
            disabled={isBusy}
          >
            {showClientForm ? (
              <>
                <X className="h-4 w-4" />
                Close
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add client
              </>
            )}
          </Button>
        </header>

        {/* Client Form */}
        {showClientForm && (
          <form
            onSubmit={clientForm.handleSubmit(handleSubmitClient)}
            className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 mb-4"
          >
            <p className="text-xs font-medium text-indigo-300">
              {editingClientId ? `Editing ${clients.find(c => c.id === editingClientId)?.name}` : "Create new client"}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="client-name">Name <span className="text-rose-400">*</span></Label>
                <Input
                  id="client-name"
                  placeholder="Client name"
                  {...clientForm.register("name")}
                  disabled={isBusy}
                  className="border-white/20 bg-slate-800/80 text-white placeholder:text-slate-500"
                />
                {clientForm.formState.errors.name && (
                  <p className="text-xs text-red-400">{clientForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="client-email">Email</Label>
                <Input
                  id="client-email"
                  type="email"
                  placeholder="contact@client.com"
                  {...clientForm.register("email")}
                  disabled={isBusy}
                  className="border-white/20 bg-slate-800/80 text-white placeholder:text-slate-500"
                />
                {clientForm.formState.errors.email && (
                  <p className="text-xs text-red-400">{clientForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="client-company">Company</Label>
                <Input
                  id="client-company"
                  placeholder="Company name"
                  {...clientForm.register("company")}
                  disabled={isBusy}
                  className="border-white/20 bg-slate-800/80 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="client-industry">Industry</Label>
                <Input
                  id="client-industry"
                  placeholder="e.g. Technology, Healthcare"
                  {...clientForm.register("industry")}
                  disabled={isBusy}
                  className="border-white/20 bg-slate-800/80 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="client-status">Status</Label>
                <select
                  id="client-status"
                  className="h-10 rounded-xl border border-white/20 bg-slate-800/80 px-3 text-sm text-white"
                  {...clientForm.register("status")}
                  disabled={isBusy}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="glassDark"
                onClick={cancelClientEdit}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingClientId ? "Update client" : "Create client"}
              </Button>
            </div>
          </form>
        )}

        {/* Clients List */}
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
          {isLoading && clients.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-300 py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading clients...
            </div>
          ) : clients.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No clients available yet. Create your first client above.</p>
          ) : (
            clients.map(client => (
              <article
                key={client.id}
                className={`rounded-2xl border px-4 py-3 transition hover:border-indigo-400 ${
                  client.id === editingClientId
                    ? "border-indigo-400 bg-indigo-500/10"
                    : "border-white/10 bg-slate-900/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <h4 className="text-sm font-semibold text-white">{client.name}</h4>
                    {client.email && (
                      <p className="text-xs text-slate-400">{client.email}</p>
                    )}
                    {(client.company || client.industry) && (
                      <p className="text-[11px] text-slate-500">
                        {[client.company, client.industry].filter(Boolean).join(" • ")}
                      </p>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-wide ${
                    client.status === "active" ? "bg-green-500/20 text-green-300" : "bg-slate-500/20 text-slate-300"
                  }`}>
                    {client.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>Created {formatDateTime(client.createdAt)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startClientEdit(client.id)}
                      className="flex items-center gap-1 text-slate-200 hover:text-white"
                      disabled={isBusy}
                    >
                      <Edit className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteClient(client.id)}
                      className="flex items-center gap-1 text-red-300 hover:text-red-200"
                      disabled={isBusy}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
