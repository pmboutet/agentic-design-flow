"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Edit,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ClientEditDialog } from "@/components/project/ClientEditDialog";
import { ClientContactsDialog } from "@/components/admin/ClientContactsDialog";
import { ClientEditForm } from "@/components/admin/ClientEditForm";
import { useClientContext } from "@/components/admin/ClientContext";
import { adminRequest, type FeedbackState } from "@/components/admin/useAdminResources";
import { formatDateTime } from "@/components/admin/dashboard/utils";
import { gradientButtonClasses } from "@/components/admin/dashboard/constants";
import type { ClientRecord } from "@/types";

export function ClientsAdminView() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  // Get context - includes selected client from sidebar
  const { selectedClientId, selectedClient, refreshClients: refreshContextClients } = useClientContext();

  // Edit mode state - when set, shows full page edit instead of list
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);

  // Create dialog state (still uses dialog)
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Contacts dialog state
  const [contactsDialogOpen, setContactsDialogOpen] = useState(false);
  const [contactsClientId, setContactsClientId] = useState<string | null>(null);
  const [contactsClientName, setContactsClientName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const clientsData = await adminRequest<ClientRecord[]>("/api/admin/clients");
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
      const data = await adminRequest<ClientRecord[]>("/api/admin/clients");
      setClients(data ?? []);
      // Also refresh the global context so menus/dropdowns are updated
      await refreshContextClients();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to refresh clients"
      });
    }
  }, [refreshContextClients]);

  const openCreateDialog = () => {
    setCreateDialogOpen(true);
  };

  const openEditFullPage = (client: ClientRecord) => {
    setEditingClient(client);
  };

  const closeEditFullPage = () => {
    setEditingClient(null);
  };

  const openContactsDialog = (client: ClientRecord) => {
    setContactsClientId(client.id);
    setContactsClientName(client.name);
    setContactsDialogOpen(true);
  };

  const handleCreateSuccess = () => {
    void refreshClients();
    setFeedback({ type: "success", message: "Client created successfully" });
  };

  const handleEditSuccess = () => {
    void refreshClients();
    setFeedback({ type: "success", message: "Client updated successfully" });
    setEditingClient(null);
  };

  const handleDeleteClient = async (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!window.confirm(`Delete client "${client?.name}"? This action cannot be undone.`)) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      await adminRequest(`/api/admin/clients/${clientId}`, { method: "DELETE" });
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

  // If a specific client is selected in sidebar, show full page edit form directly
  if (selectedClientId !== "all" && selectedClient) {
    return (
      <ClientEditForm
        clientId={selectedClient.id}
        clientName={selectedClient.name}
        mode="edit"
        fullPage
        onSuccess={() => {
          void refreshClients();
          setFeedback({ type: "success", message: "Client updated successfully" });
        }}
        // No cancel button when controlled by sidebar - user changes via selector
      />
    );
  }

  // If editing a client via button click, show full page edit form
  if (editingClient) {
    return (
      <ClientEditForm
        clientId={editingClient.id}
        clientName={editingClient.name}
        mode="edit"
        fullPage
        onSuccess={handleEditSuccess}
        onCancel={closeEditFullPage}
      />
    );
  }

  // Otherwise show the client list
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
            onClick={openCreateDialog}
            disabled={isBusy}
          >
            <Plus className="h-4 w-4" />
            Add client
          </Button>
        </header>

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
                className="rounded-2xl border px-4 py-3 transition hover:border-indigo-400 border-white/10 bg-slate-900/40"
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
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openContactsDialog(client)}
                      className="flex items-center gap-1 text-indigo-300 hover:text-indigo-200"
                      disabled={isBusy}
                    >
                      <Users className="h-3 w-3" />
                      Contacts
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditFullPage(client)}
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

      {/* Create Client Dialog (still uses dialog for create) */}
      <ClientEditDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        clientId={null}
        clientName={null}
        onClientChange={handleCreateSuccess}
        mode="create"
      />

      {/* Contacts Dialog */}
      <ClientContactsDialog
        open={contactsDialogOpen}
        onOpenChange={setContactsDialogOpen}
        clientId={contactsClientId}
        clientName={contactsClientName}
      />
    </div>
  );
}
