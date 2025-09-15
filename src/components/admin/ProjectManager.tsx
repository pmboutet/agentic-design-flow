"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type ClientRecord, type ManagedUser, type ProjectRecord } from "@/types";

const statuses = ["active", "paused", "completed", "archived"] as const;

const formSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(255),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  clientId: z.string().uuid("Client invalide"),
  startDate: z.string().trim().min(1, "Date de début requise"),
  endDate: z.string().trim().min(1, "Date de fin requise"),
  status: z.enum(statuses),
  createdBy: z.string().trim().optional()
});

export type ProjectFormValues = z.infer<typeof formSchema>;

interface ProjectManagerProps {
  clients: ClientRecord[];
  users: ManagedUser[];
  projects: ProjectRecord[];
  onCreate: (values: ProjectFormValues) => Promise<void>;
  isLoading?: boolean;
}

export function ProjectManager({ clients, users, projects, onCreate, isLoading }: ProjectManagerProps) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      clientId: clients[0]?.id ?? "",
      startDate: "",
      endDate: "",
      status: "active",
      createdBy: ""
    }
  });

  useEffect(() => {
    if (clients.length === 0) {
      return;
    }
    const current = form.getValues("clientId");
    if (!current) {
      form.setValue("clientId", clients[0].id);
    }
  }, [clients, form]);

  const handleSubmit = async (values: ProjectFormValues) => {
    await onCreate(values);
    form.reset({
      name: "",
      description: "",
      clientId: clients[0]?.id ?? "",
      startDate: "",
      endDate: "",
      status: "active",
      createdBy: ""
    });
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Projets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="project-name">Nom du projet</Label>
            <Input id="project-name" {...form.register("name")}
              placeholder="Transformation digitale" disabled={isLoading} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea id="project-description" rows={3} {...form.register("description")}
              placeholder="Objectifs du projet" disabled={isLoading} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-client">Client</Label>
            <select id="project-client" {...form.register("clientId")}
              className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm" disabled={isLoading}>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-owner">Créé par</Label>
            <select id="project-owner" {...form.register("createdBy")}
              className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm" disabled={isLoading}>
              <option value="">Aucun</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.fullName || user.email}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-start">Début</Label>
            <Input id="project-start" type="datetime-local" {...form.register("startDate")}
              disabled={isLoading} />
            {form.formState.errors.startDate && (
              <p className="text-sm text-destructive">{form.formState.errors.startDate.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-end">Fin</Label>
            <Input id="project-end" type="datetime-local" {...form.register("endDate")}
              disabled={isLoading} />
            {form.formState.errors.endDate && (
              <p className="text-sm text-destructive">{form.formState.errors.endDate.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-status">Statut</Label>
            <select id="project-status" {...form.register("status")}
              className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm" disabled={isLoading}>
              {statuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" className="neumorphic-raised" disabled={isLoading}>
              Créer le projet
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-muted-foreground">Projets récents</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {projects.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun projet enregistré pour le moment.</p>
            )}
            {projects.map(project => (
              <div key={project.id} className="neumorphic-shadow p-3 rounded-lg bg-white/60">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.clientName}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">
                    {project.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(project.startDate).toLocaleDateString()} → {new Date(project.endDate).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
