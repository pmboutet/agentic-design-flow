"use client";

/**
 * ChallengeFormDialog component
 * Extracted from ProjectJourneyBoard for better maintainability
 * Handles challenge creation and editing in a dialog modal
 */

import { type ChangeEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { ProjectChallengeNode, ProjectParticipantSummary } from "@/types";
import type { ChallengeFormState, FeedbackState } from "../types";
import { impactLabels, challengeStatusOptions } from "../constants";

// ===== Types =====

export interface ChallengeFormDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Whether editing an existing challenge vs creating new */
  isEditing: boolean;
  /** Current form values */
  formValues: ChallengeFormState;
  /** Callback when a form field changes */
  onFieldChange: (
    field: keyof ChallengeFormState
  ) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  /** Callback when parent challenge selection changes */
  onParentChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  /** Callback when owner selection toggles */
  onOwnerToggle: (ownerId: string) => void;
  /** Callback to save the challenge */
  onSave: () => Promise<void>;
  /** Callback to delete the challenge (only in edit mode) */
  onDelete?: () => Promise<void>;
  /** Callback to cancel/close the form */
  onCancel: () => void;
  /** Whether save operation is in progress */
  isSaving: boolean;
  /** Feedback message to display */
  feedback: FeedbackState | null;
  /** Available users for owner selection */
  availableUsers: ProjectParticipantSummary[];
  /** Parent challenge options for the dropdown */
  parentChallengeOptions: Array<{ id: string; label: string }>;
  /** Invalid parent IDs (to prevent circular references) */
  invalidParentIds: Set<string>;
  /** Currently selected parent challenge details */
  selectedParentChallenge: ProjectChallengeNode | null;
}

// ===== Component =====

export function ChallengeFormDialog({
  isOpen,
  onOpenChange,
  isEditing,
  formValues,
  onFieldChange,
  onParentChange,
  onOwnerToggle,
  onSave,
  onDelete,
  onCancel,
  isSaving,
  feedback,
  availableUsers,
  parentChallengeOptions,
  invalidParentIds,
  selectedParentChallenge,
}: ChallengeFormDialogProps) {
  const handleDialogOpenChange = (open: boolean) => {
    if (open) {
      onOpenChange(true);
    } else {
      onCancel();
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={onCancel}
        >
          <Card
            className="relative w-full max-w-3xl border border-indigo-400/50 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-indigo-950/80 shadow-xl shadow-indigo-500/10 my-4 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onCancel}
                className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 p-1 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
                aria-label="Close challenge form"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
            <CardHeader className="pr-10">
              <Dialog.Title asChild>
                <CardTitle>
                  {isEditing ? "Edit challenge" : "Create a new challenge"}
                </CardTitle>
              </Dialog.Title>
              <Dialog.Description className="text-sm text-slate-300">
                {isEditing
                  ? "Update the challenge status, impact or context without leaving the admin board."
                  : "Provide a clear title, status and description so collaborators can respond effectively."}
              </Dialog.Description>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error feedback */}
              {feedback?.type === "error" && (
                <Alert variant="destructive">
                  <AlertTitle>Something went wrong</AlertTitle>
                  <AlertDescription>{feedback.message}</AlertDescription>
                </Alert>
              )}

              {/* Form fields */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Title */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="challenge-title" className="text-indigo-300">
                    Title
                  </Label>
                  <Input
                    id="challenge-title"
                    value={formValues.title}
                    onChange={onFieldChange("title")}
                    placeholder="What problem are you addressing?"
                    className="border-white/10 bg-slate-950/80 text-slate-100 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-400/20"
                  />
                </div>

                {/* Status */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="challenge-status" className="text-indigo-300">
                    Status
                  </Label>
                  <select
                    id="challenge-status"
                    value={formValues.status}
                    onChange={onFieldChange("status")}
                    className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                  >
                    {challengeStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Impact */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="challenge-impact" className="text-indigo-300">
                    Impact
                  </Label>
                  <select
                    id="challenge-impact"
                    value={formValues.impact}
                    onChange={onFieldChange("impact")}
                    className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                  >
                    {(
                      Object.entries(impactLabels) as [ProjectChallengeNode["impact"], string][]
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Parent challenge */}
                {(parentChallengeOptions.length > 0 || formValues.parentId) && (
                  <div className="md:col-span-2 flex flex-col gap-2">
                    <Label htmlFor="challenge-parent" className="text-indigo-300">
                      Parent challenge
                    </Label>
                    <select
                      id="challenge-parent"
                      value={formValues.parentId}
                      onChange={onParentChange}
                      className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                    >
                      <option value="">No parent (top-level)</option>
                      {parentChallengeOptions
                        .filter((option) => !invalidParentIds.has(option.id))
                        .map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-400">
                      {formValues.parentId
                        ? selectedParentChallenge
                          ? `This challenge will be nested under "${selectedParentChallenge.title}".`
                          : "This challenge will be nested under the selected parent."
                        : "Leave empty to create a top-level challenge."}
                    </p>
                  </div>
                )}

                {/* Description */}
                <div className="md:col-span-2 flex flex-col gap-2">
                  <Label htmlFor="challenge-description" className="text-indigo-300">
                    Description
                  </Label>
                  <Textarea
                    id="challenge-description"
                    rows={3}
                    value={formValues.description}
                    onChange={onFieldChange("description")}
                    placeholder="Provide useful context so the team understands the challenge."
                    className="border-white/10 bg-slate-950/80 text-slate-100 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-400/20"
                  />
                </div>
              </div>

              {/* Owner selection */}
              {availableUsers.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label className="text-indigo-300">Owners</Label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {availableUsers.map((user) => {
                      const isSelected = formValues.ownerIds.includes(user.id);
                      return (
                        <label
                          key={user.id}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-slate-950/60 px-3 py-2 text-sm transition",
                            isSelected
                              ? "border-indigo-400/70 bg-indigo-500/10 text-indigo-100"
                              : "border-white/10 text-slate-200 hover:border-indigo-300/50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onOwnerToggle(user.id)}
                            className="h-4 w-4 rounded border-white/30 bg-slate-900 text-indigo-500 focus:ring-indigo-400"
                          />
                          <span className="flex flex-col leading-tight">
                            <span className="font-medium text-white">{user.name}</span>
                            {user.role && (
                              <span className="text-xs text-slate-400">{user.role}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="gap-2 bg-gradient-to-r from-indigo-600/75 via-indigo-500/70 to-violet-500/75 text-white shadow-lg hover:shadow-xl hover:from-indigo-500/85 hover:via-indigo-400/80 hover:to-violet-400/85 hover:bg-transparent"
                  onClick={onSave}
                  disabled={isSaving || !formValues.title.trim()}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isSaving ? "Saving" : isEditing ? "Update challenge" : "Save challenge"}
                </Button>
                {isEditing && onDelete && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={onDelete}
                    disabled={isSaving}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                )}
                <Button
                  type="button"
                  variant="glassDark"
                  onClick={onCancel}
                  disabled={isSaving}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
