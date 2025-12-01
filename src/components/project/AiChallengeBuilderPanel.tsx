"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, RefreshCcw, ShieldPlus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LoaderInsightConstellation } from "@/components/ui/LoaderInsightConstellation";
import { useIndeterminateProgress } from "@/hooks/useIndeterminateProgress";
import { Button } from "@/components/ui/button";
import { AiDiffView } from "@/components/project/AiDiffView";
import { Input } from "@/components/ui/input";
import { EditableText } from "@/components/ui/EditableText";
import {
  type AiChallengeUpdateSuggestion,
  type AiFoundationInsight,
  type AiNewChallengeSuggestion,
  type AiSubChallengeUpdateSuggestion,
  type ProjectChallengeNode,
  type ProjectParticipantSummary,
} from "@/types";
import { cn } from "@/lib/utils";

// Function to apply challenge suggestion with foundation insights
async function applyChallengeSuggestion(
  projectId: string,
  suggestion: AiChallengeUpdateSuggestion
): Promise<void> {
  const response = await fetch(`/api/admin/projects/${projectId}/ai/challenge-builder/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      challengeId: suggestion.challengeId,
      updates: suggestion.updates,
      foundationInsights: suggestion.foundationInsights,
      subChallengeUpdates: suggestion.subChallengeUpdates,
      newSubChallenges: suggestion.newSubChallenges,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to apply suggestion');
  }
}

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
  onApplyChallengeUpdates: (
    challengeId: string,
    updates?: AiChallengeUpdateSuggestion["updates"] | null,
    foundationInsights?: AiFoundationInsight[],
  ) => void | Promise<void>;
  onDismissChallengeUpdates: (challengeId: string) => void;
  onDismissSuggestion: (challengeId: string) => void;
  applyingChallengeUpdateIds: Set<string>;
  onApplySubChallengeUpdate: (challengeId: string, update: AiSubChallengeUpdateSuggestion) => void | Promise<void>;
  onDismissSubChallengeUpdate: (challengeId: string, subChallengeId: string) => void;
  applyingSubChallengeUpdateIds: Set<string>;
  onApplySuggestedNewSubChallenge: (
    challengeId: string,
    index: number,
    suggestion: AiNewChallengeSuggestion,
  ) => void | Promise<void>;
  onDismissSuggestedNewSubChallenge: (challengeId: string, index: number) => void;
  applyingNewSubChallengeKeys: Set<string>;
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

function cloneOwners(owners?: ProjectParticipantSummary[]): ProjectParticipantSummary[] | undefined {
  return owners ? owners.map(owner => ({ ...owner })) : owners;
}

function cloneChallengeSuggestion(value: AiChallengeUpdateSuggestion): AiChallengeUpdateSuggestion {
  return {
    ...value,
    updates: value.updates
      ? {
          ...value.updates,
          owners: cloneOwners(value.updates.owners),
        }
      : value.updates ?? null,
    subChallengeUpdates: value.subChallengeUpdates?.map(update => ({ ...update })),
    newSubChallenges: value.newSubChallenges?.map(item => ({
      ...item,
      owners: cloneOwners(item.owners),
    })),
    agentMetadata: value.agentMetadata ? { ...value.agentMetadata } : value.agentMetadata,
    errors: value.errors ? [...value.errors] : value.errors,
  };
}

function cloneNewChallengeSuggestion(value: AiNewChallengeSuggestion): AiNewChallengeSuggestion {
  return {
    ...value,
    owners: cloneOwners(value.owners),
  };
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

interface SuggestionCardProps {
  suggestion: AiChallengeUpdateSuggestion;
  challenge: ProjectChallengeNode | undefined;
  applyingChallengeUpdate: boolean;
  applyingSubChallengeUpdateIds: Set<string>;
  applyingNewSubChallengeKeys: Set<string>;
  onApplyChallengeUpdate: (
    updates?: AiChallengeUpdateSuggestion["updates"] | null,
    foundationInsights?: AiFoundationInsight[],
  ) => void;
  onDismissChallengeUpdate: () => void;
  onDismissSuggestion: () => void;
  onApplySubChallengeUpdate: (update: AiSubChallengeUpdateSuggestion) => void;
  onDismissSubChallengeUpdate: (subChallengeId: string) => void;
  onApplyNewSubChallenge: (index: number, suggestion: AiNewChallengeSuggestion) => void;
  onDismissNewSubChallenge: (index: number) => void;
}

function SuggestionCard({
  suggestion,
  challenge,
  applyingChallengeUpdate,
  applyingSubChallengeUpdateIds,
  applyingNewSubChallengeKeys,
  onApplyChallengeUpdate,
  onDismissChallengeUpdate,
  onDismissSuggestion,
  onApplySubChallengeUpdate,
  onDismissSubChallengeUpdate,
  onApplyNewSubChallenge,
  onDismissNewSubChallenge,
}: SuggestionCardProps) {
  const [draft, setDraft] = useState<AiChallengeUpdateSuggestion>(() => cloneChallengeSuggestion(suggestion));
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  useEffect(() => {
    setDraft(cloneChallengeSuggestion(suggestion));
  }, [suggestion]);

  const originalTitle = challenge?.title ?? suggestion.challengeTitle;
  const originalDescription = challenge?.description ?? "";
  const updatedTitle = draft.updates?.title ?? null;
  const updatedDescription = draft.updates?.description ?? null;
  const updatedStatus = draft.updates?.status ?? null;
  const updatedImpact = draft.updates?.impact ?? null;
  const updatedOwners = draft.updates?.owners;
  const hasChallengeFieldChanges = Boolean(
    draft.updates &&
      (draft.updates.title ||
        draft.updates.description ||
        draft.updates.status ||
        draft.updates.impact ||
        draft.updates.owners?.length),
  );
  const hasChallengeUpdate = hasChallengeFieldChanges || Boolean(draft.foundationInsights?.length);

  const handleSummaryChange = (value: string) => {
    setDraft(current => ({
      ...current,
      summary: value.length > 0 ? value : undefined,
    }));
  };

  const handleUpdateField = (key: "title" | "description", value: string) => {
    setDraft(current => {
      const updates = current.updates ? { ...current.updates } : {};
      return {
        ...current,
        updates: {
          ...updates,
          [key]: value.length > 0 ? value : undefined,
        },
      };
    });
  };

  const handleSubChallengeUpdateChange = (
    index: number,
    key: "title" | "description" | "summary",
    value: string,
  ) => {
    setDraft(current => {
      const list = current.subChallengeUpdates ? [...current.subChallengeUpdates] : [];
      const target = { ...list[index] };
      if (value.length === 0) {
        delete (target as Record<string, unknown>)[key];
      } else {
        (target as Record<string, unknown>)[key] = value;
      }
      list[index] = target;
      return { ...current, subChallengeUpdates: list };
    });
  };

  const handleNewSubChallengeChange = (
    index: number,
    key: "title" | "description" | "summary",
    value: string,
  ) => {
    setDraft(current => {
      const list = current.newSubChallenges ? [...current.newSubChallenges] : [];
      const target = { ...list[index] };
      if (value.length === 0) {
        delete (target as Record<string, unknown>)[key];
      } else {
        (target as Record<string, unknown>)[key] = value;
      }
      list[index] = target;
      return { ...current, newSubChallenges: list };
    });
  };

  const handleApplyChallenge = () => {
    if (!hasChallengeUpdate) {
      return;
    }
    onApplyChallengeUpdate(draft.updates ?? null, draft.foundationInsights);
  };

  const handleDismissChallenge = () => {
    onDismissChallengeUpdate();
  };

  const handleApplySubChallenge = (index: number) => {
    const update = draft.subChallengeUpdates?.[index];
    if (!update) {
      return;
    }
    onApplySubChallengeUpdate(update);
  };

  const handleApplyNewSubChallenge = (index: number) => {
    const newSuggestion = draft.newSubChallenges?.[index];
    if (!newSuggestion) {
      return;
    }
    onApplyNewSubChallenge(index, newSuggestion);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 shadow-inner">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <h4 className="text-base font-semibold text-white">{originalTitle}</h4>
          <EditableText
            value={draft.summary ?? ""}
            onChange={handleSummaryChange}
            placeholder="Ajoutez ou ajustez le résumé de la recommandation"
            className="border-slate-700 bg-slate-900/80"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            onClick={() => {
              setDraft(cloneChallengeSuggestion(suggestion));
              onDismissSuggestion();
            }}
          >
            Dismiss all
          </Button>
          {hasChallengeUpdate ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
                onClick={handleDismissChallenge}
                disabled={applyingChallengeUpdate}
              >
                Ignore update
              </Button>
              <Button
                type="button"
                className="gap-2 bg-emerald-500/90 text-emerald-100 hover:bg-emerald-500"
                onClick={handleApplyChallenge}
                disabled={!hasChallengeUpdate || applyingChallengeUpdate}
              >
                {applyingChallengeUpdate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Apply challenge
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-4 text-sm text-slate-200">
        {draft.foundationInsights?.length ? (
          <div className="space-y-3">
            <SectionTitle>Foundation Insights</SectionTitle>
            <div className="space-y-2">
              {draft.foundationInsights.map((insight, index) => (
                <div
                  key={`${insight.insightId}-${index}`}
                  className="rounded-md border border-blue-400/30 bg-blue-500/10 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h5 className="text-sm font-medium text-blue-100">{insight.title}</h5>
                      <p className="text-xs text-blue-200/80 mt-1">{insight.reason}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium ${
                      insight.priority === 'critical' ? 'bg-red-500/20 text-red-200 border border-red-400/30' :
                      insight.priority === 'high' ? 'bg-orange-500/20 text-orange-200 border border-orange-400/30' :
                      insight.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-400/30' :
                      'bg-green-500/20 text-green-200 border border-green-400/30'
                    }`}>
                      {insight.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {updatedTitle && updatedTitle !== originalTitle ? (
          <div>
            <SectionTitle>Title</SectionTitle>
            <p className="mt-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
              Current title: {originalTitle}
            </p>
            <Input
              value={updatedTitle}
              onChange={event => handleUpdateField("title", event.target.value)}
              className="mt-2 border border-slate-700 bg-slate-900/80 text-slate-100"
              disabled={applyingChallengeUpdate}
            />
          </div>
        ) : null}

        {updatedDescription && updatedDescription !== originalDescription ? (
          <div>
            <SectionTitle>Description</SectionTitle>
            {isEditingDescription ? (
              <div className="mt-2 space-y-2">
                <EditableText
                  value={updatedDescription ?? ""}
                  onChange={value => handleUpdateField("description", value)}
                  placeholder="Description mise à jour"
                  className="border-slate-700 bg-slate-900/80 text-slate-100"
                  disabled={applyingChallengeUpdate}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingDescription(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  Voir les modifications
                </Button>
              </div>
            ) : (
              <AiDiffView
                previous={originalDescription}
                next={updatedDescription}
                className="mt-2"
                onEdit={() => setIsEditingDescription(true)}
              />
            )}
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

        {draft.subChallengeUpdates?.length ? (
          <div className="space-y-3">
            <SectionTitle>Sub-challenge updates</SectionTitle>
            {draft.subChallengeUpdates.map((update, index) => {
              const isApplying = applyingSubChallengeUpdateIds.has(update.id);
              return (
                <div
                  key={update.id}
                  className="space-y-2 rounded-md border border-indigo-400/30 bg-indigo-500/10 px-3 py-2"
                >
                  <Input
                    value={update.title ?? ""}
                    onChange={event => handleSubChallengeUpdateChange(index, "title", event.target.value)}
                    placeholder={`Sub-challenge ${update.id}`}
                    className="border border-indigo-300/40 bg-indigo-500/20 text-sm text-indigo-100 placeholder:text-indigo-200/60"
                    disabled={isApplying}
                  />
                  {update.description ? (
                  <EditableText
                    value={update.description}
                    onChange={value => handleSubChallengeUpdateChange(index, "description", value)}
                    placeholder="Description du sous-challenge"
                    className="border-indigo-300/40 bg-indigo-500/15 text-xs text-indigo-100"
                    textClassName="text-xs text-indigo-100"
                    disabled={isApplying}
                  />
                ) : null}
                {update.summary ? (
                  <EditableText
                    value={update.summary}
                    onChange={value => handleSubChallengeUpdateChange(index, "summary", value)}
                    placeholder="Résumé du sous-challenge"
                    className="border-indigo-300/40 bg-indigo-500/15 text-xs text-indigo-100"
                    textClassName="text-xs text-indigo-100"
                    disabled={isApplying}
                  />
                ) : null}
                {update.status ? (
                  <p className="text-xs text-indigo-100/80">
                    {formatStatusSummary("Status", undefined, update.status)}
                  </p>
                ) : null}
                {update.impact ? (
                  <p className="text-xs text-indigo-100/80">
                    {formatStatusSummary("Impact", undefined, update.impact)}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-indigo-300/40 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25"
                    onClick={() => onDismissSubChallengeUpdate(update.id)}
                    disabled={isApplying}
                  >
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1 bg-emerald-500/90 text-emerald-100 hover:bg-emerald-500"
                    onClick={() => handleApplySubChallenge(index)}
                    disabled={isApplying}
                  >
                    {isApplying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Apply
                  </Button>
                </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {draft.newSubChallenges?.length ? (
          <div className="space-y-3">
            <SectionTitle>New sub-challenges</SectionTitle>
            {draft.newSubChallenges.map((newChallenge, index) => {
              const key = `${suggestion.challengeId}:${newChallenge.referenceId ?? index}`;
              const isApplying = applyingNewSubChallengeKeys.has(key);
              return (
                <div
                  key={`${suggestion.challengeId}-${index}`}
                  className="space-y-3 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2"
                >
                  <Input
                    value={newChallenge.title}
                    onChange={event => handleNewSubChallengeChange(index, "title", event.target.value)}
                    className="border border-emerald-300/40 bg-emerald-500/15 text-sm font-semibold text-emerald-100 placeholder:text-emerald-200/70"
                    disabled={isApplying}
                />
                <EditableText
                  value={newChallenge.description ?? ""}
                  onChange={value => handleNewSubChallengeChange(index, "description", value)}
                  placeholder="Describe the new sub-challenge"
                  className="border-emerald-300/40 bg-emerald-500/15 text-xs text-emerald-100"
                  textClassName="text-xs text-emerald-100"
                  disabled={isApplying}
                />
                {newChallenge.summary ? (
                  <EditableText
                    value={newChallenge.summary}
                    onChange={value => handleNewSubChallengeChange(index, "summary", value)}
                    placeholder="Résumé"
                    className="border-emerald-300/40 bg-emerald-500/15 text-xs text-emerald-100"
                    textClassName="text-xs text-emerald-100"
                    disabled={isApplying}
                  />
                ) : null}
                <div className="flex flex-wrap gap-2 text-[11px] text-emerald-100/80">
                  {newChallenge.status ? (
                    <span className="rounded-full border border-emerald-300/50 px-2 py-0.5">
                      Status: {newChallenge.status}
                    </span>
                  ) : null}
                  {newChallenge.impact ? (
                    <span className="rounded-full border border-emerald-300/50 px-2 py-0.5">
                      Impact: {newChallenge.impact}
                    </span>
                  ) : null}
                  {newChallenge.owners?.length ? (
                    <span className="rounded-full border border-emerald-300/50 px-2 py-0.5">
                      Owners: {formatOwnerList(newChallenge.owners)}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-emerald-300/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                    onClick={() => onDismissNewSubChallenge(index)}
                    disabled={isApplying}
                  >
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1 bg-emerald-500/90 text-emerald-100 hover:bg-emerald-500"
                    onClick={() => handleApplyNewSubChallenge(index)}
                    disabled={isApplying}
                  >
                    {isApplying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldPlus className="h-3.5 w-3.5" />
                    )}
                    Create
                  </Button>
                </div>
                </div>
              );
            })}
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
  onApply: (updatedSuggestion: AiNewChallengeSuggestion) => void;
  onDismiss: () => void;
}) {
  const [draft, setDraft] = useState<AiNewChallengeSuggestion>(() => cloneNewChallengeSuggestion(suggestion));

  useEffect(() => {
    setDraft(cloneNewChallengeSuggestion(suggestion));
  }, [suggestion]);

  const handleFieldChange = (key: "title" | "description" | "summary", value: string) => {
    setDraft(current => ({
      ...current,
      [key]: value.length > 0 ? value : undefined,
    }));
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 shadow-inner">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Input
            value={draft.title}
            onChange={event => handleFieldChange("title", event.target.value)}
            className="border border-emerald-300/40 bg-emerald-500/15 text-base font-semibold text-emerald-100 placeholder:text-emerald-200/70"
          />
          <EditableText
            value={draft.summary ?? ""}
            onChange={value => handleFieldChange("summary", value)}
            placeholder="Résumé de la recommandation"
            className="border-emerald-300/40 bg-emerald-500/15 text-sm text-emerald-100"
            textClassName="text-sm text-emerald-100"
          />
          <EditableText
            value={draft.description ?? ""}
            onChange={value => handleFieldChange("description", value)}
            placeholder="Description détaillée"
            className="border-slate-700 bg-slate-900/80"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            onClick={() => {
              setDraft(cloneNewChallengeSuggestion(suggestion));
              onDismiss();
            }}
          >
            Dismiss
          </Button>
          <Button
            type="button"
            className="gap-2 bg-emerald-500/90 text-emerald-100 hover:bg-emerald-500"
            onClick={() => onApply(draft)}
            disabled={applying}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldPlus className="h-4 w-4" />}
            Create
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-4 text-sm text-slate-200">
        {draft.foundationInsights?.length ? (
          <div className="space-y-3">
            <SectionTitle>Foundation Insights</SectionTitle>
            <div className="space-y-2">
              {draft.foundationInsights.map((insight, index) => (
                <div
                  key={`${insight.insightId}-${index}`}
                  className="rounded-md border border-blue-400/30 bg-blue-500/10 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h5 className="text-sm font-medium text-blue-100">{insight.title}</h5>
                      <p className="text-xs text-blue-200/80 mt-1">{insight.reason}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium ${
                      insight.priority === 'critical' ? 'bg-red-500/20 text-red-200 border border-red-400/30' :
                      insight.priority === 'high' ? 'bg-orange-500/20 text-orange-200 border border-orange-400/30' :
                      insight.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-400/30' :
                      'bg-green-500/20 text-green-200 border border-green-400/30'
                    }`}>
                      {insight.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
        {draft.status ? (
          <span className="rounded-full border border-slate-700 px-2 py-0.5">Status: {draft.status}</span>
        ) : null}
        {draft.impact ? (
          <span className="rounded-full border border-slate-700 px-2 py-0.5">Impact: {draft.impact}</span>
        ) : null}
        {draft.owners?.length ? (
          <span className="rounded-full border border-slate-700 px-2 py-0.5">
            Owners: {formatOwnerList(draft.owners)}
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
  onApplyChallengeUpdates,
  onDismissChallengeUpdates,
  onDismissSuggestion,
  applyingChallengeUpdateIds,
  onApplySubChallengeUpdate,
  onDismissSubChallengeUpdate,
  applyingSubChallengeUpdateIds,
  onApplySuggestedNewSubChallenge,
  onDismissSuggestedNewSubChallenge,
  applyingNewSubChallengeKeys,
  onApplyNewChallenge,
  onDismissNewChallenge,
  applyingNewChallengeIndices,
}: AiChallengeBuilderPanelProps) {
  const hasSuggestions = suggestions.length > 0;
  const hasNewChallenges = newChallenges.length > 0;
  const progress = useIndeterminateProgress(isRunning);
  const insightSnippets = useMemo(() => {
    if (!isRunning) return [] as string[];
    // Gather a rotating list of short insight texts from both suggestions and new challenges
    const fromFoundation = [
      ...suggestions.flatMap(s => s.foundationInsights?.map(i => i.title || i.reason || "") || []),
      ...newChallenges.flatMap(n => n.foundationInsights?.map(i => i.title || i.reason || "") || []),
    ]
      .map(t => (t || "").trim())
      .filter(Boolean)
      .map(t => (t.length > 90 ? `${t.slice(0, 90)}…` : t));
    // Also include summaries if available
    const fromSummaries = [
      ...suggestions.map(s => s.summary || ""),
      ...newChallenges.map(n => n.summary || ""),
    ]
      .map(t => (t || "").trim())
      .filter(Boolean)
      .map(t => (t.length > 90 ? `${t.slice(0, 90)}…` : t));
    const merged = Array.from(new Set([...
      fromFoundation,
      ...fromSummaries,
    ]));
    return merged.slice(0, 20);
  }, [isRunning, suggestions, newChallenges]);

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
                className="gap-2 border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
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
            {isRunning ? (
              <LoaderInsightConstellation progress={progress} className="mb-6" snippets={insightSnippets} />
            ) : null}
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
                    applyingChallengeUpdate={applyingChallengeUpdateIds.has(suggestion.challengeId)}
                    applyingSubChallengeUpdateIds={applyingSubChallengeUpdateIds}
                    applyingNewSubChallengeKeys={applyingNewSubChallengeKeys}
                    onApplyChallengeUpdate={(updates, foundationInsights) =>
                      onApplyChallengeUpdates(suggestion.challengeId, updates, foundationInsights)
                    }
                    onDismissChallengeUpdate={() => onDismissChallengeUpdates(suggestion.challengeId)}
                    onDismissSuggestion={() => onDismissSuggestion(suggestion.challengeId)}
                    onApplySubChallengeUpdate={update =>
                      onApplySubChallengeUpdate(suggestion.challengeId, update)
                    }
                    onDismissSubChallengeUpdate={subId =>
                      onDismissSubChallengeUpdate(suggestion.challengeId, subId)
                    }
                    onApplyNewSubChallenge={(index, newSuggestion) =>
                      onApplySuggestedNewSubChallenge(suggestion.challengeId, index, newSuggestion)
                    }
                    onDismissNewSubChallenge={index =>
                      onDismissSuggestedNewSubChallenge(suggestion.challengeId, index)
                    }
                  />
                ))}
              </section>
            ) : !isRunning ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-5 text-sm text-slate-300">
                <div className="space-y-2">
                  <p className="font-medium text-slate-200">No challenge updates proposed</p>
                  <p className="text-slate-400">
                    The AI didn't find enough insights or ASK session data to suggest meaningful updates to existing challenges. 
                    To get recommendations, ensure your challenges have associated ASK sessions with insights.
                  </p>
                </div>
              </div>
            ) : null}

            {hasNewChallenges ? (
              <section className="mt-8 space-y-4">
                <SectionTitle>New challenges to create</SectionTitle>
                {newChallenges.map((suggestion, index) => (
                  <NewChallengeCard
                    key={`${suggestion.title}-${index}`}
                    suggestion={suggestion}
                    applying={applyingNewChallengeIndices.has(index)}
                    onApply={updated => onApplyNewChallenge(updated, index)}
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
