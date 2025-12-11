"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderEdit, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { FormDateTimeField } from "./FormDateTimeField";
import type { ClientRecord, ProjectRecord } from "@/types";

const statuses = ["active", "paused", "completed", "archived"] as const;

const formSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(255),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  clientId: z.string().uuid("Client invalide"),
  startDate: z.string().trim().min(1, "La date de début est requise"),
  endDate: z.string().trim().min(1, "La date de fin est requise"),
  status: z.enum(statuses),
});

type ProjectFormValues = z.infer<typeof formSchema>;

interface ProjectEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectRecord;
  clients: ClientRecord[];
  onSuccess: () => void;
}

function formatDateForInput(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function ProjectEditDialog({
  open,
  onOpenChange,
  project,
  clients,
  onSuccess,
}: ProjectEditDialogProps) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: project.name,
      description: project.description ?? "",
      clientId: project.clientId,
      startDate: formatDateForInput(project.startDate),
      endDate: formatDateForInput(project.endDate),
      status: project.status as typeof statuses[number],
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  // Reset form when project changes or dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        name: project.name,
        description: project.description ?? "",
        clientId: project.clientId,
        startDate: formatDateForInput(project.startDate),
        endDate: formatDateForInput(project.endDate),
        status: project.status as typeof statuses[number],
      });
    }
  }, [open, project, form]);

  const handleSubmit = async (values: ProjectFormValues) => {
    try {
      const response = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Erreur lors de la mise à jour du projet");
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Failed to update project:", error);
      form.setError("root", {
        message: error instanceof Error ? error.message : "Erreur lors de la mise à jour du projet",
      });
    }
  };

  // Check if the current client is in the available clients list
  const currentClientAvailable = clients.some(c => c.id === project.clientId);
  const availableClients = currentClientAvailable
    ? clients
    : [{ id: project.clientId, name: project.clientName ?? "Client inconnu" } as ClientRecord, ...clients];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderEdit className="h-5 w-5 text-indigo-400" />
            Modifier le projet
          </DialogTitle>
          <DialogDescription>
            Modifiez les informations du projet.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {form.formState.errors.root && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {form.formState.errors.root.message}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Nom du projet</Label>
            <Input
              id="project-name"
              placeholder="Transformation digitale"
              {...form.register("name")}
              disabled={isSubmitting}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-400">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              rows={3}
              placeholder="Objectifs du projet"
              {...form.register("description")}
              disabled={isSubmitting}
            />
          </div>

          {clients.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-client">Client</Label>
              <select
                id="project-client"
                {...form.register("clientId")}
                className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                disabled={isSubmitting}
              >
                {availableClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.clientId && (
                <p className="text-xs text-red-400">{form.formState.errors.clientId.message}</p>
              )}
              {clients.length > 1 && (
                <p className="text-xs text-slate-400">
                  Vous pouvez transférer ce projet vers un autre client.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <FormDateTimeField
              control={form.control}
              name="startDate"
              id="project-start"
              label="Date de début"
              placeholder="Sélectionner"
              disabled={isSubmitting}
              error={form.formState.errors.startDate?.message}
            />

            <FormDateTimeField
              control={form.control}
              name="endDate"
              id="project-end"
              label="Date de fin"
              placeholder="Sélectionner"
              disabled={isSubmitting}
              error={form.formState.errors.endDate?.message}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-status">Statut</Label>
            <select
              id="project-status"
              {...form.register("status")}
              className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
              disabled={isSubmitting}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status === "active" ? "Actif" :
                   status === "paused" ? "En pause" :
                   status === "completed" ? "Terminé" :
                   "Archivé"}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
            <Button
              type="button"
              variant="glassDark"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button type="submit" className="btn-gradient" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
