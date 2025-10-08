"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, RefreshCcw, ShieldPlus, Sparkles, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { AiDiffView } from "@/components/project/AiDiffView";
import {
  type AiChallengeUpdateSuggestion,
  type AiNewChallengeSuggestion,
  type ProjectChallengeNode,
  type ProjectParticipantSummary,
} from "@/types";
import { cn } from "@/lib/utils";

interface AiChallengeBuilderPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  isRunning: boolean;
  onRunAgain: () => void;
  suggestions: AiChallengeUpdateSuggestion[];
  newChallenges: AiNewChallengeSuggestion[];
  errors?: Array<{ challengeId: string | null; message: string }> | null;
  challengeLookup: Map<string, ProjectChallengeNode>;
  onApplySuggestion: (suggestion: AiChallengeUpdateSuggestion) => void | Promise<void>;
  onDismissSuggestion: (challengeId: string) => void;
  applyingChallengeIds: Set<string>;
  onApplyNewChallenge: (suggestion: AiNewChallengeSuggestion, index: number) => void | Promise<void>;
  onDismissNewChallenge: (index: number) => void;
  applyingNewChallengeIndices: Set<number>;
}

function formatOwnerList(owners?: ProjectParticipantSummary[]): string {
  if (!owners || owners.length === 0) {
    return "Unassigned";
  }
  return owners.map(owner => owner.name).join(", ");
}

function formatStatusSummary(label: string, previous?: string | null, next?: string | null): string {
  const previousLabel = previous ?? "Unspecified";
  const nextLabel = next ?? "Unchanged";
  if (previousLabel === nextLabel) {
    return `${label}: ${previousLabel}`;
  }
  return `${label}: ${previousLabel} → ${nextLabel}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{children}</h3>;
}

function SuggestionCard({
  suggestion,
  challenge,
  applying,
  onApply,
  onDismiss,
}: {
  suggestion: AiChallengeUpdateSuggestion;
  challenge: ProjectChallengeNode | undefined;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const originalTitle = challenge?.title ?? suggestion.challengeTitle;
  const originalDescription = challenge?.description ?? "";
  const updatedTitle = suggestion.updates?.title ?? null;
  const updatedDescription = suggestion.updates?.description ?? null;
  const updatedStatus = suggestion.updates?.status ?? null;
  const updatedImpact = suggestion.updates?.impact ?? null;
  const updatedOwners = suggestion.updates?.owners;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 shadow-inner">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-base font-semibold text-white">{originalTitle}</h4>
          {suggestion.summary ? (
            <p className="mt-1 text-sm text-slate-300">{suggestion.summary}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-700 text-slate-200 hover:bg-slate-800"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
          <Button
            type="button"
            className="gap-2 bg-emerald-500/90 text-emerald-100 hover:bg-emerald-500"
            onClick={onApply}
            disabled={applying}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Apply
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-4 text-sm text-slate-200">
        {updatedTitle && updatedTitle !== originalTitle ? (
          <div>
            <SectionTitle>Title</SectionTitle>
            <p className="mt-1 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100">
              {originalTitle}
              <span className="mx-2 text-slate-500">→</span>
              <span className="font-medium text-indigo-200">{updatedTitle}</span>
            </p>
          </div>
        ) : null}

        {updatedDescription && updatedDescription !== originalDescription ? (
          <div>
            <SectionTitle>Description</SectionTitle>
            <AiDiffView previous={originalDescription} next={updatedDescription} className="mt-2" />
          </div>
        ) : null}

        {updatedStatus || updatedImpact ? (
          <div className="grid gap-2 md:grid-cols-2">
            {updatedStatus ? (
              <div>
                <SectionTitle>Status</SectionTitle>
                <p className="mt-1 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200">
                  {formatStatusSummary("Status", challenge?.status ?? null, updatedStatus)}
                </p>
              </div>
            ) : null}
            {updatedImpact ? (
              <div>
                <SectionTitle>Impact</SectionTitle>
                <p className="mt-1 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200">
                  {formatStatusSummary("Impact", challenge?.impact ?? null, updatedImpact ?? null)}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {updatedOwners ? (
          <div>
            <SectionTitle>Suggested Owner</SectionTitle>
            <p className="mt-1 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200">
              {formatStatusSummary("Owner", formatOwnerList(challenge?.owners), formatOwnerList(updatedOwners))}
            </p>
          </div>
        ) : null}

        {suggestion.subChallengeUpdates?.length ? (
          <div className="space-y-3">
            <SectionTitle>Sub-challenge updates</SectionTitle>
            {suggestion.subChallengeUpdates.map(update => (
              <div key={update.id} className="rounded-md border border-indigo-400/30 bg-indigo-500/10 px-3 py-2">
                <p className="text-sm font-medium text-indigo-100">{update.title ?? `Sub-challenge ${update.id}`}</p>
                <ul className="mt-1 space-y-1 text-xs text-indigo-100/80">
                  {update.description ? <li>Description change proposed</li> : null}
                  {update.status ? <li>{formatStatusSummary("Status", undefined, update.status)}</li> : null}
                  {update.impact ? <li>{formatStatusSummary("Impact", undefined, update.impact)}</li> : null}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        {suggestion.newSubChallenges?.length ? (
          <div className="space-y-3">
            <SectionTitle>New sub-challenges</SectionTitle>
            {suggestion.newSubChallenges.map(newChallenge => (
              <div key={`${suggestion.challengeId}-${newChallenge.title}`} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
                <p className="text-sm font-semibold text-emerald-100">{newChallenge.title}</p>
                {newChallenge.description ? (
                  <p className="mt-1 text-xs text-emerald-100/80">{newChallenge.description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-emerald-100/80">
                  {newChallenge.status ? <span className="rounded-full border border-emerald-300/50 px-2 py-0.5">Status: {newChallenge.status}</span> : null}
                  {newChallenge.impact ? <span className="rounded-full border border-emerald-300/50 px-2 py-0.5">Impact: {newChallenge.impact}</span> : null}
                  {newChallenge.owners?.length ? (
                    <span className="rounded-full border border-emerald-300/50 px-2 py-0.5">
                      Owners: {formatOwnerList(newChallenge.owners)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NewChallengeCard({
  suggestion,
  applying,
  onApply,
  onDismiss,
}: {
  suggestion: AiNewChallengeSuggestion;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 shadow-inner">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-base font-semibold text-emerald-100">{suggestion.title}</h4>
          {suggestion.summary ? (
            <p className="mt-1 text-sm text-emerald-100/80">{suggestion.summary}</p>
          ) : null}
          {suggestion.description ? (
            <p className="mt-2 text-sm text-slate-200">{suggestion.description}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-700 text-slate-200 hover:bg-slate-800"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
          <Button
            type="button"
            className="gap-2 bg-emerald-500/90 text-emerald-100 hover:bg-emerald-500"
            onClick={onApply}
            disabled={applying}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldPlus className="h-4 w-4" />}
            Create
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
        {suggestion.status ? (
          <span className="rounded-full border border-slate-700 px-2 py-0.5">Status: {suggestion.status}</span>
        ) : null}
        {suggestion.impact ? (
          <span className="rounded-full border border-slate-700 px-2 py-0.5">Impact: {suggestion.impact}</span>
        ) : null}
        {suggestion.owners?.length ? (
          <span className="rounded-full border border-slate-700 px-2 py-0.5">
            Owners: {formatOwnerList(suggestion.owners)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function AiChallengeBuilderPanel({
  open,
  onOpenChange,
  projectName,
  isRunning,
  onRunAgain,
  suggestions,
  newChallenges,
  errors,
  challengeLookup,
  onApplySuggestion,
  onDismissSuggestion,
  applyingChallengeIds,
  onApplyNewChallenge,
  onDismissNewChallenge,
  applyingNewChallengeIndices,
}: AiChallengeBuilderPanelProps) {
  const hasSuggestions = suggestions.length > 0;
  const hasNewChallenges = newChallenges.length > 0;

  const panelTitle = useMemo(() => {
    if (isRunning) {
      return "Running AI challenge builder";
    }
    if (hasSuggestions || hasNewChallenges) {
      return "AI recommendations ready";
    }
    return "No AI recommendations yet";
  }, [isRunning, hasSuggestions, hasNewChallenges]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur" />
        <Dialog.Content className="fixed inset-0 z-50 m-auto flex max-h-[90vh] w-[min(960px,95vw)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-white">{panelTitle}</Dialog.Title>
              <Dialog.Description className="text-sm text-slate-300">
                {projectName ? `Project: ${projectName}` : "AI builder output"}
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-slate-700 text-slate-200 hover:bg-slate-800"
                onClick={onRunAgain}
                disabled={isRunning}
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                {isRunning ? "Running" : "Run again"}
              </Button>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" className="text-slate-300 hover:bg-slate-800">
                  <X className="h-5 w-5" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {errors?.length ? (
              <div className="mb-5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <p className="font-semibold">Some steps failed</p>
                <ul className="mt-2 space-y-1">
                  {errors.map((error, index) => (
                    <li key={`${error.challengeId ?? "global"}-${index}`}>
                      {error.challengeId ? `Challenge ${error.challengeId}: ` : ""}
                      {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {hasSuggestions ? (
              <section className="space-y-4">
                <SectionTitle>Challenge updates</SectionTitle>
                {suggestions.map(suggestion => (
                  <SuggestionCard
                    key={suggestion.challengeId}
                    suggestion={suggestion}
                    challenge={challengeLookup.get(suggestion.challengeId)}
                    applying={applyingChallengeIds.has(suggestion.challengeId)}
                    onApply={() => onApplySuggestion(suggestion)}
                    onDismiss={() => onDismissSuggestion(suggestion.challengeId)}
                  />
                ))}
              </section>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-5 text-sm text-slate-300">
                No existing challenge updates proposed.
              </div>
            )}

            {hasNewChallenges ? (
              <section className="mt-8 space-y-4">
                <SectionTitle>New challenges to create</SectionTitle>
                {newChallenges.map((suggestion, index) => (
                  <NewChallengeCard
                    key={`${suggestion.title}-${index}`}
                    suggestion={suggestion}
                    applying={applyingNewChallengeIndices.has(index)}
                    onApply={() => onApplyNewChallenge(suggestion, index)}
                    onDismiss={() => onDismissNewChallenge(index)}
                  />
                ))}
              </section>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
