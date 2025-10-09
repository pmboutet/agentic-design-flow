"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type ChallengeRecord, type ManagedUser } from "@/types";

const statusOptions = ["open", "in_progress", "active", "closed", "archived"] as const;
const priorityOptions = ["low", "medium", "high", "critical"] as const;

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(statusOptions),
  priority: z.enum(priorityOptions),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  assignedTo: z.string().trim().optional(),
  dueDate: z.string().trim().optional()
});

export type ChallengeFormValues = z.infer<typeof formSchema>;

interface ChallengeEditorProps {
  challenges: ChallengeRecord[];
  users: ManagedUser[];
  onSave: (challengeId: string, values: ChallengeFormValues) => Promise<void>;
  isLoading?: boolean;
}

export function ChallengeEditor({ challenges, users, onSave, isLoading }: ChallengeEditorProps) {
  const [selectedId, setSelectedId] = useState<string>(challenges[0]?.id ?? "");

  const form = useForm<ChallengeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "open",
      priority: "medium",
      category: "",
      assignedTo: "",
      dueDate: ""
    }
  });

  const selectedChallenge = useMemo(
    () => challenges.find(challenge => challenge.id === selectedId),
    [challenges, selectedId]
  );

  useEffect(() => {
    if (!selectedChallenge) {
      return;
    }

    form.reset({
      name: selectedChallenge.name,
      description: selectedChallenge.description ?? "",
      status: (selectedChallenge.status as typeof statusOptions[number]) || "open",
      priority: (selectedChallenge.priority as typeof priorityOptions[number]) || "medium",
      category: selectedChallenge.category ?? "",
      assignedTo: selectedChallenge.assignedTo ?? "",
      dueDate: selectedChallenge.dueDate
        ? new Date(selectedChallenge.dueDate).toISOString().slice(0, 16)
        : ""
    });
  }, [selectedChallenge, form]);

  const handleSubmit = async (values: ChallengeFormValues) => {
    if (!selectedChallenge) {
      return;
    }
    await onSave(selectedChallenge.id, values);
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Challenges</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="challenge-select">Select a challenge</Label>
          <select
            id="challenge-select"
            value={selectedId}
            onChange={event => setSelectedId(event.target.value)}
            className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
            disabled={isLoading}
          >
            {challenges.map(challenge => (
              <option key={challenge.id} value={challenge.id}>
                {challenge.name} {challenge.projectName ? `• ${challenge.projectName}` : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedChallenge ? (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="challenge-name">Name</Label>
              <Input
                id="challenge-name"
                {...form.register("name")}
                disabled={isLoading}
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="challenge-description">Description</Label>
              <Textarea
                id="challenge-description"
                rows={3}
                {...form.register("description")}
                disabled={isLoading}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="challenge-status">Status</Label>
              <select
                id="challenge-status"
                {...form.register("status")}
                className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
                disabled={isLoading}
              >
                {statusOptions.map(status => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="challenge-priority">Priority</Label>
              <select
                id="challenge-priority"
                {...form.register("priority")}
                className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
                disabled={isLoading}
              >
                {priorityOptions.map(priority => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="challenge-category">Category</Label>
              <Input
                id="challenge-category"
                {...form.register("category")}
                placeholder="Operational, Technical…"
                disabled={isLoading}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="challenge-owner">Assigned to</Label>
              <select
                id="challenge-owner"
                {...form.register("assignedTo")}
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

            <div className="flex flex-col gap-2">
              <Label htmlFor="challenge-due">Due date</Label>
              <Input
                id="challenge-due"
                type="datetime-local"
                {...form.register("dueDate")}
                disabled={isLoading}
              />
            </div>

            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={isLoading}>
                Update challenge
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">No challenges to display.</p>
        )}
      </CardContent>
    </Card>
  );
}
