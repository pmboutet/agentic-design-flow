"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoaderInsightConstellation } from "@/components/ui/LoaderInsightConstellation";
import { useIndeterminateProgress } from "@/hooks/useIndeterminateProgress";
import {
  type AiChallengeBuilderResponse,
  type AiChallengeUpdateSuggestion,
  type AiFoundationInsight,
  type AiNewChallengeSuggestion,
  type AiSubChallengeUpdateSuggestion,
  type ProjectChallengeNode,
  type ProjectJourneyBoardData,
} from "@/types";
import { AiChallengeBuilderPanel } from "@/components/project/AiChallengeBuilderPanel";

interface PersistedResults {
  suggestions: AiChallengeUpdateSuggestion[];
  newChallenges: AiNewChallengeSuggestion[];
  errors: Array<{ challengeId: string | null; message: string }> | null;
  lastRunAt: string;
  projectId: string;
}

interface AiChallengeBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  boardData: ProjectJourneyBoardData | null;
  onChallengeCreated?: () => void;
}

export function AiChallengeBuilderModal({
  open,
  onOpenChange,
  projectId,
  projectName,
  boardData,
  onChallengeCreated,
}: AiChallengeBuilderModalProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [suggestions, setSuggestions] = useState<AiChallengeUpdateSuggestion[]>([]);
  const [newChallenges, setNewChallenges] = useState<AiNewChallengeSuggestion[]>([]);
  const [errors, setErrors] = useState<Array<{ challengeId: string | null; message: string }> | null>(null);
  const [applyingChallengeUpdateIds, setApplyingChallengeUpdateIds] = useState<Set<string>>(new Set());
  const [applyingSubChallengeUpdateIds, setApplyingSubChallengeUpdateIds] = useState<Set<string>>(new Set());
  const [applyingNewSubChallengeKeys, setApplyingNewSubChallengeKeys] = useState<Set<string>>(new Set());
  const [applyingNewChallengeIndices, setApplyingNewChallengeIndices] = useState<Set<number>>(new Set());
  const progress = useIndeterminateProgress(isRunning);

  // Build challenge lookup map
  const challengeLookup = useMemo(() => {
    if (!boardData) return new Map<string, ProjectChallengeNode>();

    const map = new Map<string, ProjectChallengeNode>();
    const traverse = (nodes: ProjectChallengeNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(boardData.challenges);
    return map;
  }, [boardData]);

  // Load persisted results
  const loadResults = useCallback(async (checkRunning: boolean = false) => {
    try {
      const resultsResponse = await fetch(`/api/admin/projects/${projectId}/ai/challenge-builder/results`, {
        cache: "no-store",
        credentials: "include",
      });
      const resultsPayload = await resultsResponse.json();

      if (resultsResponse.ok && resultsPayload.success && resultsPayload.data) {
        const persisted = resultsPayload.data as PersistedResults;
        setSuggestions(persisted.suggestions || []);
        setNewChallenges(persisted.newChallenges || []);
        setErrors(persisted.errors);
        
        // Check if results are recent (within last 30 seconds) to determine if still running
        if (checkRunning) {
          const lastRunAt = new Date(persisted.lastRunAt);
          const now = new Date();
          const secondsSinceRun = (now.getTime() - lastRunAt.getTime()) / 1000;
          // Stop polling if results are older than 30 seconds or have content
          const shouldStop = secondsSinceRun >= 30 || persisted.suggestions.length > 0 || persisted.newChallenges.length > 0 || persisted.errors;
          if (shouldStop) {
            setIsRunning(false);
          }
        } else {
          setIsRunning(false);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to load results:", error);
      return false;
    }
  }, [projectId]);

  // Poll for results when running
  useEffect(() => {
    if (isRunning && open) {
      const interval = setInterval(async () => {
        const hasResults = await loadResults(true);
        if (hasResults) {
          // loadResults already checks if we should stop polling
          // No need for duplicate fetch
        } else {
          // No results yet, continue polling
        }
      }, 2000); // Poll every 2 seconds

      return () => {
        clearInterval(interval);
      };
    }
  }, [isRunning, open, loadResults]);

  // Load results when modal opens
  useEffect(() => {
    if (open && boardData) {
      loadResults(true).then((hasResults) => {
        // If no results found, check if we should start polling anyway
        // (in case a search was just launched)
        if (!hasResults) {
          // Check if there's a recent search by looking at the lastRunAt
          // For now, we'll assume if no results, we're not running
          setIsRunning(false);
        }
      });
    }
  }, [open, boardData, loadResults]);

  // Run AI challenge builder (fire-and-forget)
  const handleRunBuilder = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setErrors(null);
    setSuggestions([]);
    setNewChallenges([]);

    // Fire and forget - don't wait for response
    fetch(`/api/admin/projects/${projectId}/ai/challenge-builder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch((error) => {
      console.error("Failed to start challenge builder:", error);
      setErrors([{ challengeId: null, message: error instanceof Error ? error.message : String(error) }]);
      setIsRunning(false);
    });

    // Start polling for results
    // The polling is handled by the useEffect above
  }, [projectId, isRunning]);

  // Apply challenge update
  const handleApplyChallengeUpdate = useCallback(
    async (
      challengeId: string,
      updates?: AiChallengeUpdateSuggestion["updates"] | null,
      _foundationInsights?: AiFoundationInsight[],
    ) => {
      if (!boardData) return;

      setApplyingChallengeUpdateIds((current) => {
        const next = new Set(current);
        next.add(challengeId);
        return next;
      });

      try {
        const baseChallenge = challengeLookup.get(challengeId);
        const payload: Record<string, unknown> = {};

        if (updates?.title && updates.title !== baseChallenge?.title) {
          payload.name = updates.title;
        }
        if (updates?.description && updates.description !== baseChallenge?.description) {
          payload.description = updates.description;
        }
        if (updates?.status && updates.status !== baseChallenge?.status) {
          payload.status = updates.status;
        }
        if (updates?.impact && updates.impact !== baseChallenge?.impact) {
          payload.priority = updates.impact;
        }

        if (Object.keys(payload).length > 0) {
          await fetch(`/api/admin/challenges/${challengeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }).then(async (response) => {
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
              throw new Error(
                result.error || `Failed to update challenge ${baseChallenge?.title ?? challengeId}.`,
              );
            }
          });

          // Reload results to refresh the list
          await loadResults();
        }

        // Remove applied suggestion
        setSuggestions((current) => current.filter((s) => s.challengeId !== challengeId));
      } catch (error) {
        console.error("Failed to apply challenge update:", error);
      } finally {
        setApplyingChallengeUpdateIds((current) => {
          const next = new Set(current);
          next.delete(challengeId);
          return next;
        });
      }
    },
    [boardData, challengeLookup, loadResults],
  );

  // Dismiss challenge update
  const handleDismissChallengeUpdate = useCallback((challengeId: string) => {
    setSuggestions((current) => current.filter((s) => s.challengeId !== challengeId));
  }, []);

  // Dismiss suggestion
  const handleDismissSuggestion = useCallback((challengeId: string) => {
    setSuggestions((current) => current.filter((s) => s.challengeId !== challengeId));
  }, []);

  // Apply sub-challenge update
  const handleApplySubChallengeUpdate = useCallback(
    async (parentChallengeId: string, update: AiSubChallengeUpdateSuggestion) => {
      if (!boardData) return;

      setApplyingSubChallengeUpdateIds((current) => {
        const next = new Set(current);
        next.add(update.id);
        return next;
      });

      try {
        const currentChallenge = challengeLookup.get(update.id);
        const payload: Record<string, unknown> = {};

        if (currentChallenge) {
          if (update.title && update.title !== currentChallenge.title) {
            payload.name = update.title;
          }
          if (update.description && update.description !== currentChallenge.description) {
            payload.description = update.description;
          }
          if (update.status && update.status !== currentChallenge.status) {
            payload.status = update.status;
          }
          if (update.impact && update.impact !== currentChallenge.impact) {
            payload.priority = update.impact;
          }
        }

        if (currentChallenge && Object.keys(payload).length > 0) {
          await fetch(`/api/admin/challenges/${update.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }).then(async (response) => {
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
              throw new Error(
                result.error || `Failed to update sub-challenge ${currentChallenge.title}.`,
              );
            }
          });

          await loadResults();
        }

        // Remove applied sub-challenge update
        setSuggestions((current) =>
          current.map((s) => {
            if (s.challengeId !== parentChallengeId) return s;
            const remaining = (s.subChallengeUpdates ?? []).filter((item) => item.id !== update.id);
            return { ...s, subChallengeUpdates: remaining.length ? remaining : undefined };
          }),
        );
      } catch (error) {
        console.error("Failed to apply sub-challenge update:", error);
      } finally {
        setApplyingSubChallengeUpdateIds((current) => {
          const next = new Set(current);
          next.delete(update.id);
          return next;
        });
      }
    },
    [boardData, challengeLookup, loadResults],
  );

  // Dismiss sub-challenge update
  const handleDismissSubChallengeUpdate = useCallback(
    (parentChallengeId: string, subChallengeId: string) => {
      setSuggestions((current) =>
        current.map((s) => {
          if (s.challengeId !== parentChallengeId) return s;
          const remaining = (s.subChallengeUpdates ?? []).filter((item) => item.id !== subChallengeId);
          return { ...s, subChallengeUpdates: remaining.length ? remaining : undefined };
        }),
      );
    },
    [],
  );

  // Apply suggested new sub-challenge
  const handleApplySuggestedNewSubChallenge = useCallback(
    async (challengeId: string, index: number, suggestion: AiNewChallengeSuggestion) => {
      if (!boardData) return;

      const key = `${challengeId}-${index}`;
      setApplyingNewSubChallengeKeys((current) => {
        const next = new Set(current);
        next.add(key);
        return next;
      });

      try {
        const response = await fetch(`/api/admin/challenges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: suggestion.title,
            description: suggestion.description || "",
            status: suggestion.status || "open",
            priority: suggestion.impact || "medium",
            projectId: projectId,
            parentChallengeId: challengeId,
          }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to create sub-challenge");
        }

        await loadResults();

        // Remove from suggestions
        setSuggestions((current) =>
          current.map((s) => {
            if (s.challengeId !== challengeId) return s;
            const remaining = (s.newSubChallenges ?? []).filter((_, i) => i !== index);
            return { ...s, newSubChallenges: remaining.length ? remaining : undefined };
          }),
        );

        // Notify parent to refresh board
        onChallengeCreated?.();
      } catch (error) {
        console.error("Failed to apply new sub-challenge:", error);
      } finally {
        setApplyingNewSubChallengeKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [boardData, projectId, loadResults, onChallengeCreated],
  );

  // Dismiss suggested new sub-challenge
  const handleDismissSuggestedNewSubChallenge = useCallback(
    (challengeId: string, index: number) => {
      setSuggestions((current) =>
        current.map((s) => {
          if (s.challengeId !== challengeId) return s;
          const remaining = (s.newSubChallenges ?? []).filter((_, i) => i !== index);
          return { ...s, newSubChallenges: remaining.length ? remaining : undefined };
        }),
      );
    },
    [],
  );

  // Apply new challenge
  const handleApplyNewChallenge = useCallback(
    async (suggestion: AiNewChallengeSuggestion, index: number) => {
      if (!boardData) return;

      setApplyingNewChallengeIndices((current) => {
        const next = new Set(current);
        next.add(index);
        return next;
      });

      try {
        const response = await fetch(`/api/admin/challenges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: suggestion.title,
            description: suggestion.description || "",
            status: suggestion.status || "open",
            priority: suggestion.impact || "medium",
            projectId: projectId,
            parentChallengeId: suggestion.parentId || "",
          }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to create challenge");
        }

        await loadResults();

        // Remove from new challenges
        setNewChallenges((current) => current.filter((_, i) => i !== index));

        // Notify parent to refresh board
        onChallengeCreated?.();
      } catch (error) {
        console.error("Failed to apply new challenge:", error);
      } finally {
        setApplyingNewChallengeIndices((current) => {
          const next = new Set(current);
          next.delete(index);
          return next;
        });
      }
    },
    [boardData, projectId, loadResults, onChallengeCreated],
  );

  // Dismiss new challenge
  const handleDismissNewChallenge = useCallback((index: number) => {
    setNewChallenges((current) => current.filter((_, i) => i !== index));
  }, []);

  if (!boardData) {
    return null;
  }

  return (
    <AiChallengeBuilderPanel
      open={open}
      onOpenChange={onOpenChange}
      projectName={projectName}
      isRunning={isRunning}
      onRunAgain={handleRunBuilder}
      suggestions={suggestions}
      newChallenges={newChallenges}
      errors={errors}
      challengeLookup={challengeLookup}
      onApplyChallengeUpdates={handleApplyChallengeUpdate}
      onDismissChallengeUpdates={handleDismissChallengeUpdate}
      onDismissSuggestion={handleDismissSuggestion}
      applyingChallengeUpdateIds={applyingChallengeUpdateIds}
      onApplySubChallengeUpdate={handleApplySubChallengeUpdate}
      onDismissSubChallengeUpdate={handleDismissSubChallengeUpdate}
      applyingSubChallengeUpdateIds={applyingSubChallengeUpdateIds}
      onApplySuggestedNewSubChallenge={handleApplySuggestedNewSubChallenge}
      onDismissSuggestedNewSubChallenge={handleDismissSuggestedNewSubChallenge}
      applyingNewSubChallengeKeys={applyingNewSubChallengeKeys}
      onApplyNewChallenge={handleApplyNewChallenge}
      onDismissNewChallenge={handleDismissNewChallenge}
      applyingNewChallengeIndices={applyingNewChallengeIndices}
    />
  );
}

