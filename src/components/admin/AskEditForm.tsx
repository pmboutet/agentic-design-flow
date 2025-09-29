"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type AskSessionRecord } from "@/types";

const statusOptions = ["active", "inactive", "draft", "closed"] as const;

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
  maxParticipants: z.preprocess(parseNumber, z.number().int().positive().max(10000).optional())
});

export type AskEditFormValues = z.infer<typeof formSchema>;

interface AskEditFormProps {
  asks: AskSessionRecord[];
  onSubmit: (askId: string, values: Omit<AskEditFormValues, "askId">) => Promise<void>;
  isLoading?: boolean;
}

export function AskEditForm({ asks, onSubmit, isLoading }: AskEditFormProps) {
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
      maxParticipants: undefined
    }
  });

  const selectedId = form.watch("askId");

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
      startDate: new Date(ask.startDate).toISOString().slice(0, 16),
      endDate: new Date(ask.endDate).toISOString().slice(0, 16),
      status: (ask.status as typeof statusOptions[number]) || "active",
      isAnonymous: ask.isAnonymous,
      maxParticipants: ask.maxParticipants ?? undefined
    });
  }, [selectedId, asks, form]);

  const handleSubmit = async (values: AskEditFormValues) => {
    await onSubmit(values.askId, {
      name: values.name,
      question: values.question,
      description: values.description ?? "",
      startDate: values.startDate,
      endDate: values.endDate,
      status: values.status,
      isAnonymous: values.isAnonymous,
      maxParticipants: values.maxParticipants
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
          className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm"
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

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-start">Start</Label>
          <Input
            id="edit-start"
            type="datetime-local"
            {...form.register("startDate")}
            disabled={isLoading}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-end">End</Label>
          <Input
            id="edit-end"
            type="datetime-local"
            {...form.register("endDate")}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-status">Status</Label>
          <select
            id="edit-status"
            {...form.register("status")}
            className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm"
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

      <Button type="submit" className="neumorphic-raised" disabled={isLoading}>
        Update session
      </Button>
    </form>
  );
}
