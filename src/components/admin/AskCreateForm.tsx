"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { DurationSlider } from "@/components/ui/duration-slider";
import { type ChallengeRecord, type ManagedUser, type ProjectRecord } from "@/types";

const statusOptions = ["active", "inactive", "draft", "closed"] as const;
const deliveryModes = ["physical", "digital"] as const;
const conversationModes = ["individual_parallel", "collaborative", "group_reporter"] as const;

const parseNumber = (value: unknown) => {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const formSchema = z.object({
  challengeId: z.string().uuid("Invalid challenge"),
  askKey: z.string().trim().min(3, "Key is too short").max(255).regex(/^[a-zA-Z0-9._-]+$/),
  name: z.string().trim().min(1, "Name is required").max(255),
  question: z.string().trim().min(5, "Question is too short").max(2000),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  startDate: z.string().trim().min(1, "Start date is required"),
  endDate: z.string().trim().min(1, "End date is required"),
  status: z.enum(statusOptions),
  isAnonymous: z.boolean().default(false),
  maxParticipants: z.preprocess(parseNumber, z.number().int().positive().max(10000).optional()),
  deliveryMode: z.enum(deliveryModes),
  conversationMode: z.enum(conversationModes),
  expectedDurationMinutes: z.number().int().min(1).max(30).default(8),
  participantIds: z.array(z.string().uuid()).default([]),
  spokespersonId: z.string().uuid().optional().or(z.literal(""))
});

export type AskCreateFormValues = z.infer<typeof formSchema>;

interface AskCreateFormProps {
  challenges: ChallengeRecord[];
  projects: ProjectRecord[];
  availableUsers: ManagedUser[];
  onSubmit: (values: AskCreateFormValues & { projectId: string }) => Promise<void>;
  isLoading?: boolean;
}

export function AskCreateForm({ challenges, projects, availableUsers, onSubmit, isLoading }: AskCreateFormProps) {
  const initialChallenge = challenges[0]?.id ?? "";

  const form = useForm<AskCreateFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      challengeId: initialChallenge,
      askKey: "",
      name: "",
      question: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "active",
      isAnonymous: false,
      maxParticipants: undefined,
      deliveryMode: "digital",
      conversationMode: "collaborative",
      expectedDurationMinutes: 8,
      participantIds: [],
      spokespersonId: ""
    }
  });

  const selectedChallengeId = form.watch("challengeId");
  const selectedConversationMode = form.watch("conversationMode");
  const selectedParticipants = form.watch("participantIds");
  const selectedSpokesperson = form.watch("spokespersonId");

  const selectedChallenge = challenges.find(item => item.id === selectedChallengeId);
  const eligibleUsers = useMemo(() => {
    const projectId = selectedChallenge?.projectId ?? null;

    return availableUsers.filter(user => {
      const normalizedRole = user.role?.toLowerCase?.() ?? "";
      const isGlobal = normalizedRole.includes("admin") || normalizedRole.includes("owner");

      if (!projectId) {
        return true;
      }

      if (isGlobal) {
        return true;
      }

      if (!user.projectIds || user.projectIds.length === 0) {
        return false;
      }

      return user.projectIds.includes(projectId);
    });
  }, [availableUsers, selectedChallenge]);

  useEffect(() => {
    const firstChallenge = challenges[0]?.id;
    if (firstChallenge && !form.getValues("challengeId")) {
      form.setValue("challengeId", firstChallenge);
    }
  }, [challenges, form]);

  // Set default dates from project when challenge is selected
  useEffect(() => {
    if (!selectedChallenge?.projectId) return;

    const project = projects.find(p => p.id === selectedChallenge.projectId);
    if (!project) return;

    // Only set dates if they are currently empty
    const currentStartDate = form.getValues("startDate");
    const currentEndDate = form.getValues("endDate");

    if (!currentStartDate && project.startDate) {
      form.setValue("startDate", project.startDate);
    }
    if (!currentEndDate && project.endDate) {
      form.setValue("endDate", project.endDate);
    }
  }, [selectedChallenge, projects, form]);

  useEffect(() => {
    if (selectedSpokesperson && !selectedParticipants.includes(selectedSpokesperson)) {
      form.setValue("spokespersonId", "");
    }
  }, [form, selectedParticipants, selectedSpokesperson]);

  const toggleParticipant = (userId: string) => {
    const current = form.getValues("participantIds") ?? [];
    if (current.includes(userId)) {
      const next = current.filter(id => id !== userId);
      form.setValue("participantIds", next, { shouldDirty: true });
      if (form.getValues("spokespersonId") === userId) {
        form.setValue("spokespersonId", "", { shouldDirty: true });
      }
    } else {
      form.setValue("participantIds", [...current, userId], { shouldDirty: true });
    }
  };

  const handleSubmit = async (values: AskCreateFormValues) => {
    const challenge = challenges.find(item => item.id === values.challengeId);
    if (!challenge || !challenge.projectId) {
      throw new Error("Unable to determine the project for this challenge");
    }

    await onSubmit({ ...values, projectId: challenge.projectId });

    // Get project dates for reset
    const project = projects.find(p => p.id === challenge.projectId);

    form.reset({
      challengeId: challenge.id,
      askKey: "",
      name: "",
      question: "",
      description: "",
      startDate: project?.startDate ?? "",
      endDate: project?.endDate ?? "",
      status: "active",
      isAnonymous: false,
      maxParticipants: undefined,
      deliveryMode: "digital",
      conversationMode: "collaborative",
      expectedDurationMinutes: 8,
      participantIds: [],
      spokespersonId: ""
    });
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="create-challenge">Challenge</Label>
        <select
          id="create-challenge"
          {...form.register("challengeId")}
          className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
          disabled={isLoading}
        >
          {challenges.map(challenge => (
            <option key={challenge.id} value={challenge.id}>
              {challenge.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="create-key">ASK key</Label>
        <Input
          id="create-key"
          {...form.register("askKey")}
          placeholder="team-session-001"
          disabled={isLoading}
        />
        {form.formState.errors.askKey && (
          <p className="text-sm text-destructive">{form.formState.errors.askKey.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="create-name">Name</Label>
        <Input
          id="create-name"
          {...form.register("name")}
          placeholder="Exploration"
          disabled={isLoading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="create-question">Question</Label>
        <Textarea
          id="create-question"
          rows={3}
          {...form.register("question")}
          placeholder="What is the challenge?"
          disabled={isLoading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="create-description">Description</Label>
        <Textarea
          id="create-description"
          rows={2}
          {...form.register("description")}
          placeholder="Optional context"
          disabled={isLoading}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-start">Start</Label>
          <Controller
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <DateTimePicker
                id="create-start"
                value={field.value}
                onChange={field.onChange}
                disabled={isLoading}
                placeholder="Select start date"
              />
            )}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-end">End</Label>
          <Controller
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <DateTimePicker
                id="create-end"
                value={field.value}
                onChange={field.onChange}
                disabled={isLoading}
                placeholder="Select end date"
              />
            )}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-status">Status</Label>
          <select
            id="create-status"
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
        <div className="flex items-center gap-2">
          <input
            id="create-anon"
            type="checkbox"
            className="h-4 w-4"
            {...form.register("isAnonymous")}
            disabled={isLoading}
          />
          <Label htmlFor="create-anon">Anonymous</Label>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-delivery">Mode d'interaction</Label>
          <select
            id="create-delivery"
            {...form.register("deliveryMode")}
            className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
            disabled={isLoading}
          >
            {deliveryModes.map(mode => (
              <option key={mode} value={mode}>
                {mode === "physical" ? "Physique" : "Digital"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-conversation-mode">Mode de conversation</Label>
          <select
            id="create-conversation-mode"
            {...form.register("conversationMode")}
            className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
            disabled={isLoading}
          >
            <option value="individual_parallel">Réponses individuelles en parallèle</option>
            <option value="collaborative">Conversation multi-voix</option>
            <option value="group_reporter">Groupe avec rapporteur</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {selectedConversationMode === "individual_parallel" && "Chacun répond séparément, sans voir les autres"}
            {selectedConversationMode === "collaborative" && "Tout le monde voit et peut rebondir sur les messages des autres"}
            {selectedConversationMode === "group_reporter" && "Tout le monde voit tout, un rapporteur consolide"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="create-duration">Durée attendue de la conversation</Label>
        <Controller
          control={form.control}
          name="expectedDurationMinutes"
          render={({ field }) => (
            <DurationSlider
              value={field.value}
              onChange={field.onChange}
              disabled={isLoading}
            />
          )}
        />
        <p className="text-xs text-muted-foreground">
          Cette durée sera divisée par le nombre d'étapes du plan de conversation pour adapter le rythme de l'agent IA.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Contacts de la session</Label>
        <p className="text-xs text-muted-foreground">
          Sélectionnez uniquement les personnes affectées au projet. Les rôles administrateurs restent disponibles pour tous les projets.
        </p>
        <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-border bg-white/70 p-3">
          {eligibleUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun contact disponible pour ce projet.</p>
          ) : (
            eligibleUsers.map(user => {
              const isSelected = selectedParticipants.includes(user.id);
              const displayName = user.fullName || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
              return (
                <label
                  key={user.id}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-white/60 px-3 py-2 text-sm shadow-sm"
                >
                  <div>
                    <p className="font-medium text-slate-800">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{user.role}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isSelected}
                    onChange={() => toggleParticipant(user.id)}
                    disabled={isLoading}
                  />
                </label>
              );
            })
          )}
        </div>
      </div>

      {selectedConversationMode === "group_reporter" && selectedParticipants.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-spokesperson">Rapporteur</Label>
          <select
            id="create-spokesperson"
            {...form.register("spokespersonId")}
            className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
            disabled={isLoading}
          >
            <option value="">Sélectionner un rapporteur</option>
            {selectedParticipants.map(participantId => {
              const user = eligibleUsers.find(item => item.id === participantId) || availableUsers.find(item => item.id === participantId);
              const displayName = user?.fullName || `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || user?.email || participantId;
              return (
                <option key={participantId} value={participantId}>
                  {displayName}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-muted-foreground">
            Le rapporteur consolide et porte la voix du groupe
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="create-max">Max participants</Label>
        <Input
          id="create-max"
          type="number"
          min={1}
          {...form.register("maxParticipants", { valueAsNumber: true })}
          placeholder="50"
          disabled={isLoading}
        />
      </div>

      <Button type="submit" className="neumorphic-raised" disabled={isLoading}>
        Create session
      </Button>
    </form>
  );
}
