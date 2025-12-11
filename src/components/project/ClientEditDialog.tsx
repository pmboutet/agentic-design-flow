"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, Loader2, X } from "lucide-react";
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

type ClientFormValues = z.infer<typeof clientFormSchema>;

interface ClientEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string | null;
  clientName?: string | null;
  onClientChange?: () => void;
  mode: "create" | "edit";
}

export function ClientEditDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onClientChange,
  mode
}: ClientEditDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      industry: "",
      status: "active"
    }
  });

  // Load client data when editing
  const loadClientData = useCallback(async () => {
    if (mode !== "edit" || !clientId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}`, {
        credentials: "include"
      });
      const payload = await response.json();

      if (payload.success && payload.data) {
        const client: ClientRecord = payload.data;
        form.reset({
          name: client.name,
          email: client.email ?? "",
          company: client.company ?? "",
          industry: client.industry ?? "",
          status: (client.status as "active" | "inactive") || "active"
        });
      } else {
        // If we can't load the client data, just use the name we have
        form.reset({
          name: clientName ?? "",
          email: "",
          company: "",
          industry: "",
          status: "active"
        });
      }
    } catch {
      // Use what we have
      form.reset({
        name: clientName ?? "",
        email: "",
        company: "",
        industry: "",
        status: "active"
      });
    } finally {
      setIsLoading(false);
    }
  }, [mode, clientId, clientName, form]);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(null);
      if (mode === "edit") {
        loadClientData();
      } else {
        form.reset({
          name: "",
          email: "",
          company: "",
          industry: "",
          status: "active"
        });
      }
    }
  }, [open, mode, loadClientData, form]);

  const handleSubmit = async (values: ClientFormValues) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const url = mode === "edit" ? `/api/admin/clients/${clientId}` : "/api/admin/clients";
      const method = mode === "edit" ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values)
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to save client");
      }

      setSuccess(mode === "edit" ? "Client updated successfully" : "Client created successfully");
      onClientChange?.();

      // Close dialog after short delay
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl my-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20">
                  <Building2 className="h-5 w-5 text-indigo-300" />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-white">
                    {mode === "edit" ? "Edit Client" : "Create Client"}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-300">
                    {mode === "edit"
                      ? "Update the client information below"
                      : "Fill in the information to create a new client"}
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/10 p-1.5 text-slate-200 transition hover:bg-white/20"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={form.handleSubmit(handleSubmit)} className="mt-6 space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="client-name" className="text-slate-200">
                  Name <span className="text-rose-400">*</span>
                </Label>
                <Input
                  id="client-name"
                  {...form.register("name")}
                  placeholder="Client name"
                  disabled={isLoading}
                  className="border-white/20 bg-slate-800/80 text-white placeholder:text-slate-500"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-rose-400">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="client-email" className="text-slate-200">Email</Label>
                <Input
                  id="client-email"
                  type="email"
                  {...form.register("email")}
                  placeholder="contact@client.com"
                  disabled={isLoading}
                  className="border-white/20 bg-slate-800/80 text-white placeholder:text-slate-500"
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-rose-400">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="client-company" className="text-slate-200">Company</Label>
                  <Input
                    id="client-company"
                    {...form.register("company")}
                    placeholder="Company name"
                    disabled={isLoading}
                    className="border-white/20 bg-slate-800/80 text-white placeholder:text-slate-500"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="client-industry" className="text-slate-200">Industry</Label>
                  <Input
                    id="client-industry"
                    {...form.register("industry")}
                    placeholder="Industry"
                    disabled={isLoading}
                    className="border-white/20 bg-slate-800/80 text-white placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="client-status" className="text-slate-200">Status</Label>
                <select
                  id="client-status"
                  {...form.register("status")}
                  disabled={isLoading}
                  className="h-10 rounded-md border border-white/20 bg-slate-800/80 px-3 text-sm text-white"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {success}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="glassDark"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="glassDark"
                  disabled={isLoading}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-500"
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "edit" ? "Update Client" : "Create Client"}
                </Button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
