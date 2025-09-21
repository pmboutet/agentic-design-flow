"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type ChallengeRecord } from "@/types";

const statusOptions = ["active", "inactive", "draft", "closed"] as const;

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
  maxParticipants: z.preprocess(parseNumber, z.number().int().positive().max(10000).optional())
});

export type AskCreateFormValues = z.infer<typeof formSchema>;

interface AskCreateFormProps {
  challenges: ChallengeRecord[];
  onSubmit: (values: AskCreateFormValues & { projectId: string }) => Promise<void>;
  isLoading?: boolean;
}

export function AskCreateForm({ challenges, onSubmit, isLoading }: AskCreateFormProps) {
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
      maxParticipants: undefined
    }
  });

  useEffect(() => {
    const firstChallenge = challenges[0]?.id;
    if (firstChallenge && !form.getValues("challengeId")) {
      form.setValue("challengeId", firstChallenge);
    }
  }, [challenges, form]);

  const handleSubmit = async (values: AskCreateFormValues) => {
    const challenge = challenges.find(item => item.id === values.challengeId);
    if (!challenge || !challenge.projectId) {
      throw new Error("Unable to determine the project for this challenge");
    }

    await onSubmit({ ...values, projectId: challenge.projectId });
    form.reset({
      challengeId: challenge.id,
      askKey: "",
      name: "",
      question: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "active",
      isAnonymous: false,
      maxParticipants: undefined
    });
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="create-challenge">Challenge</Label>
        <select
          id="create-challenge"
          {...form.register("challengeId")}
          className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm"
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
          <Input
            id="create-start"
            type="datetime-local"
            {...form.register("startDate")}
            disabled={isLoading}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-end">End</Label>
          <Input
            id="create-end"
            type="datetime-local"
            {...form.register("endDate")}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-status">Status</Label>
          <select
            id="create-status"
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
            id="create-anon"
            type="checkbox"
            className="h-4 w-4"
            {...form.register("isAnonymous")}
            disabled={isLoading}
          />
          <Label htmlFor="create-anon">Anonymous</Label>
        </div>
      </div>

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
