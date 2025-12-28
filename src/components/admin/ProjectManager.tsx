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
import { FormDateTimeField } from "./FormDateTimeField";
import { type ClientRecord, type ManagedUser, type ProjectRecord } from "@/types";

const statuses = ["active", "paused", "completed", "archived"] as const;

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(10000).optional().or(z.literal("")),
  clientId: z.string().uuid("Invalid client"),
  startDate: z.string().trim().min(1, "Start date is required"),
  endDate: z.string().trim().min(1, "End date is required"),
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
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              {...form.register("name")}
              placeholder="Digital transformation"
              disabled={isLoading}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              rows={3}
              {...form.register("description")}
              placeholder="Project goals"
              disabled={isLoading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-client">Client</Label>
            <select
              id="project-client"
              {...form.register("clientId")}
              className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
              disabled={isLoading}
            >
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-owner">Created by</Label>
            <select
              id="project-owner"
              {...form.register("createdBy")}
              className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
              disabled={isLoading}
            >
              <option value="">None</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.fullName || user.email}
                </option>
              ))}
            </select>
          </div>

          <FormDateTimeField
            control={form.control}
            name="startDate"
            id="project-start"
            label="Start"
            placeholder="Select start date"
            disabled={isLoading}
            error={form.formState.errors.startDate?.message}
            errorClassName="text-sm text-destructive"
          />

          <FormDateTimeField
            control={form.control}
            name="endDate"
            id="project-end"
            label="End"
            placeholder="Select end date"
            disabled={isLoading}
            error={form.formState.errors.endDate?.message}
            errorClassName="text-sm text-destructive"
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-status">Status</Label>
            <select
              id="project-status"
              {...form.register("status")}
              className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
              disabled={isLoading}
            >
              {statuses.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" className="neumorphic-raised" disabled={isLoading}>
              Create project
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-muted-foreground">Recent projects</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {projects.length === 0 && (
              <p className="text-sm text-muted-foreground">No projects registered yet.</p>
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
