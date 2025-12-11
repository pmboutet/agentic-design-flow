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
import { AskPromptTemplateSelector } from "./AskPromptTemplateSelector";
import { type AskSessionRecord, type ManagedUser } from "@/types";

const statusOptions = ["active", "inactive", "draft", "closed"] as const;
const deliveryModes = ["physical", "digital"] as const;
const conversationModes = ["individual_parallel", "collaborative", "group_reporter", "consultant"] as const;

const parseNumber = (value: unknown) => {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const formSchema = z.object({
  askId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(255),
  question: z.string().trim().min(5, "Question is too short").max(2000),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  startDate: z.string().trim().min(1, "Start date is required"),
  endDate: z.string().trim().min(1, "End date is required"),
  status: z.enum(statusOptions),
  isAnonymous: z.boolean(),
  maxParticipants: z.preprocess(parseNumber, z.number().int().positive().max(10000).optional()),
  deliveryMode: z.enum(deliveryModes),
  conversationMode: z.enum(conversationModes),
  expectedDurationMinutes: z.number().int().min(1).max(30).default(8),
  participantIds: z.array(z.string().uuid()).default([]),
  spokespersonId: z.string().uuid().optional().or(z.literal("")),
  systemPrompt: z.string().trim().optional().or(z.literal(""))
});

export type AskEditFormValues = z.infer<typeof formSchema>;

interface AskEditFormProps {
  asks: AskSessionRecord[];
  availableUsers: ManagedUser[];
  onSubmit: (askId: string, values: Omit<AskEditFormValues, "askId">) => Promise<void>;
  isLoading?: boolean;
}

export function AskEditForm({ asks, availableUsers, onSubmit, isLoading }: AskEditFormProps) {
  const defaultAskId = asks[0]?.id ?? "";

  const form = useForm<AskEditFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      askId: defaultAskId,
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
      spokespersonId: "",
      systemPrompt: ""
    }
  });

  const selectedId = form.watch("askId");
  const selectedConversationMode = form.watch("conversationMode");
  const selectedParticipants = form.watch("participantIds");
  const selectedSpokesperson = form.watch("spokespersonId");

  const selectedAsk = asks.find(item => item.id === selectedId);
  const eligibleUsers = useMemo(() => {
    if (!selectedAsk?.projectId) {
      return availableUsers;
    }

    return availableUsers.filter(user => {
      const normalizedRole = user.role?.toLowerCase?.() ?? "";
      const isGlobal = normalizedRole.includes("admin") || normalizedRole.includes("owner");

      if (isGlobal) {
        return true;
      }

      if (!user.projectIds || user.projectIds.length === 0) {
        return false;
      }

      return user.projectIds.includes(selectedAsk.projectId!);
    });
  }, [availableUsers, selectedAsk]);

  useEffect(() => {
    const ask = asks.find(item => item.id === selectedId);
    if (!ask) {
      return;
    }

    form.reset({
      askId: ask.id,
      name: ask.name,
      question: ask.question,
      description: ask.description ?? "",
      startDate: new Date(ask.startDate).toISOString(),
      endDate: new Date(ask.endDate).toISOString(),
      status: (ask.status as typeof statusOptions[number]) || "active",
      isAnonymous: ask.isAnonymous,
      maxParticipants: ask.maxParticipants ?? undefined,
      deliveryMode: ask.deliveryMode ?? "digital",
      conversationMode: ask.conversationMode ?? "collaborative",
      expectedDurationMinutes: ask.expectedDurationMinutes ?? 8,
      participantIds: ask.participants?.map(participant => participant.id) ?? [],
      spokespersonId: ask.participants?.find(participant => participant.isSpokesperson)?.id ?? "",
      systemPrompt: ask.systemPrompt ?? ""
    });
  }, [selectedId, asks, form]);

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

  const handleSubmit = async (values: AskEditFormValues) => {
    await onSubmit(values.askId, {
      name: values.name,
      question: values.question,
      description: values.description ?? "",
      startDate: values.startDate,
      endDate: values.endDate,
      status: values.status,
      isAnonymous: values.isAnonymous,
      maxParticipants: values.maxParticipants,
      deliveryMode: values.deliveryMode,
      conversationMode: values.conversationMode,
      expectedDurationMinutes: values.expectedDurationMinutes,
      participantIds: values.participantIds,
      spokespersonId: values.spokespersonId ?? "",
      systemPrompt: values.systemPrompt ?? ""
    });
  };

  if (asks.length === 0) {
    return <p className="text-sm text-muted-foreground">No ASK sessions registered yet.</p>;
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-ask">Session</Label>
        <select
          id="edit-ask"
          {...form.register("askId")}
          className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
          disabled={isLoading}
        >
          {asks.map(ask => (
            <option key={ask.id} value={ask.id}>
              {ask.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-name">Name</Label>
        <Input
          id="edit-name"
          {...form.register("name")}
          disabled={isLoading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-question">Question</Label>
        <Textarea
          id="edit-question"
          rows={3}
          {...form.register("question")}
          disabled={isLoading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-description">Description</Label>
        <Textarea
          id="edit-description"
          rows={2}
          {...form.register("description")}
          disabled={isLoading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <AskPromptTemplateSelector
          value={form.watch("systemPrompt") || ""}
          onChange={(value) => form.setValue("systemPrompt", value, { shouldDirty: true })}
          disabled={isLoading}
        />
        <Label htmlFor="edit-system-prompt">System prompt</Label>
        <Textarea
          id="edit-system-prompt"
          rows={6}
          placeholder="Provide the system prompt used by the AI for this ask"
          {...form.register("systemPrompt")}
          disabled={isLoading}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-start">Start</Label>
          <Controller
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <DateTimePicker
                id="edit-start"
                value={field.value}
                onChange={field.onChange}
                disabled={isLoading}
                placeholder="Select start date"
              />
            )}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-end">End</Label>
          <Controller
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <DateTimePicker
                id="edit-end"
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
          <Label htmlFor="edit-status">Status</Label>
          <select
            id="edit-status"
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
            id="edit-anon"
            type="checkbox"
            className="h-4 w-4"
            {...form.register("isAnonymous")}
            disabled={isLoading}
          />
          <Label htmlFor="edit-anon">Anonymous</Label>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-delivery">Mode d'interaction</Label>
          <select
            id="edit-delivery"
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
          <Label htmlFor="edit-conversation-mode">Mode de conversation</Label>
          <select
            id="edit-conversation-mode"
            {...form.register("conversationMode")}
            className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm text-slate-900"
            disabled={isLoading}
          >
            <option value="individual_parallel">Réponses individuelles en parallèle</option>
            <option value="collaborative">Conversation multi-voix</option>
            <option value="group_reporter">Groupe avec rapporteur</option>
            <option value="consultant">Consultant (écoute passive)</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {selectedConversationMode === "individual_parallel" && "Chacun répond séparément, sans voir les autres"}
            {selectedConversationMode === "collaborative" && "Tout le monde voit et peut rebondir sur les messages des autres"}
            {selectedConversationMode === "group_reporter" && "Tout le monde voit tout, un rapporteur consolide"}
            {selectedConversationMode === "consultant" && "L'IA écoute et suggère des questions au consultant, sans TTS"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-duration">Durée attendue de la conversation</Label>
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
          Les participants éligibles dépendent du projet associé à l'ASK.
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
          <Label htmlFor="edit-spokesperson">Rapporteur</Label>
          <select
            id="edit-spokesperson"
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
        <Label htmlFor="edit-max">Max participants</Label>
        <Input
          id="edit-max"
          type="number"
          min={1}
          {...form.register("maxParticipants", { valueAsNumber: true })}
          disabled={isLoading}
        />
      </div>

      <Button type="submit" disabled={isLoading}>
        Update session
      </Button>
    </form>
  );
}
