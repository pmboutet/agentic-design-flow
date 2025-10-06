"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronRight,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { getMockProjectJourneyData } from "@/lib/mockProjectJourney";
import {
  type ChallengeRecord,
  type ProjectAskOverview,
  type ProjectChallengeNode,
  type ProjectJourneyBoardData,
  type ProjectParticipantInsight,
  type ProjectParticipantSummary,
} from "@/types";

interface ProjectJourneyBoardProps {
  projectId: string;
}

interface ChallengeInsightRow extends ProjectParticipantInsight {
  contributors: ProjectParticipantSummary[];
  askId: string;
  askTitle: string;
}

interface AskInsightRow extends ProjectParticipantInsight {
  contributors: ProjectParticipantSummary[];
}

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

const impactLabels: Record<ProjectChallengeNode["impact"], string> = {
  low: "Low impact",
  medium: "Moderate impact",
  high: "High impact",
  critical: "Critical impact",
};

const impactClasses: Record<ProjectChallengeNode["impact"], string> = {
  low: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  medium: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  high: "border-indigo-400/40 bg-indigo-500/10 text-indigo-200",
  critical: "border-rose-400/40 bg-rose-500/10 text-rose-200",
};

const insightTypeClasses: Record<ProjectParticipantInsight["type"], string> = {
  pain: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  gain: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  signal: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  idea: "border-amber-400/40 bg-amber-500/10 text-amber-200",
};

type ChallengeStatus = "open" | "in_progress" | "active" | "closed" | "archived";

const challengeStatusOptions: { value: ChallengeStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
];

const USE_MOCK_JOURNEY = process.env.NEXT_PUBLIC_USE_MOCK_PROJECT_JOURNEY === "true";

function flattenChallenges(nodes: ProjectChallengeNode[]): ProjectChallengeNode[] {
  return nodes.flatMap(node => [node, ...(node.children ? flattenChallenges(node.children) : [])]);
}

function insertChallengeNode(
  nodes: ProjectChallengeNode[],
  newNode: ProjectChallengeNode,
  parentId?: string | null,
): ProjectChallengeNode[] {
  const [, updated] = insertChallengeNodeInternal(nodes, newNode, parentId ?? null);
  return updated;
}

function insertChallengeNodeInternal(
  nodes: ProjectChallengeNode[],
  newNode: ProjectChallengeNode,
  parentId: string | null,
): readonly [boolean, ProjectChallengeNode[]] {
  if (!parentId) {
    return [true, [newNode, ...nodes]] as const;
  }

  let inserted = false;
  const updatedNodes = nodes.map(node => {
    if (node.id === parentId) {
      inserted = true;
      const children = node.children ? [newNode, ...node.children] : [newNode];
      return { ...node, children };
    }

    if (node.children?.length) {
      const [childInserted, childNodes] = insertChallengeNodeInternal(node.children, newNode, parentId);
      if (childInserted) {
        inserted = true;
        return { ...node, children: childNodes };
      }
    }

    return node;
  });

  if (inserted) {
    return [true, updatedNodes] as const;
  }

  return [false, [newNode, ...updatedNodes]] as const;
}

function countSubChallenges(node: ProjectChallengeNode): number {
  if (!node.children?.length) {
    return 0;
  }

  return node.children.length + node.children.reduce((total, child) => total + countSubChallenges(child), 0);
}

function mergeContributors(
  existing: ProjectParticipantSummary[],
  additions: ProjectParticipantSummary[],
): ProjectParticipantSummary[] {
  const merged = new Map<string, ProjectParticipantSummary>();
  [...existing, ...additions].forEach(person => {
    const key = person.id || person.name;
    if (!merged.has(key)) {
      merged.set(key, person);
    }
  });
  return Array.from(merged.values());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatFullDate(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function formatTimeframe(startDate?: string | null, endDate?: string | null): string | null {
  if (!startDate && !endDate) {
    return null;
  }
  const startLabel = formatFullDate(startDate);
  const endLabel = formatFullDate(endDate);
  if (startLabel && endLabel) {
    return `${startLabel} – ${endLabel}`;
  }
  return startLabel ?? endLabel;
}

function toInputDate(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const iso = date.toISOString();
  return iso.slice(0, 16);
}

type ProjectEditState = {
  name: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
  systemPrompt: string;
};

type ChallengeFormState = {
  title: string;
  description: string;
  status: ChallengeStatus;
  impact: ProjectChallengeNode["impact"];
  ownerIds: string[];
  parentId: string;
};

function createEmptyChallengeForm(): ChallengeFormState {
  return {
    title: "",
    description: "",
    status: "open",
    impact: "medium",
    ownerIds: [],
    parentId: "",
  };
}

export function ProjectJourneyBoard({ projectId }: ProjectJourneyBoardProps) {
  const [boardData, setBoardData] = useState<ProjectJourneyBoardData | null>(
    USE_MOCK_JOURNEY ? getMockProjectJourneyData(projectId) : null,
  );
  const [isLoading, setIsLoading] = useState(!USE_MOCK_JOURNEY);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false);
  const [isSavingChallenge, setIsSavingChallenge] = useState(false);
  const [challengeFeedback, setChallengeFeedback] = useState<FeedbackState | null>(null);
  const [challengeFormValues, setChallengeFormValues] = useState<ChallengeFormState>(() => createEmptyChallengeForm());
  const [editValues, setEditValues] = useState<ProjectEditState>({
    name: "",
    description: "",
    status: "active",
    startDate: "",
    endDate: "",
    systemPrompt: "",
  });

  useEffect(() => {
    if (USE_MOCK_JOURNEY) {
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/projects/${projectId}/journey`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to load project data");
        }
        if (!isMounted) {
          return;
        }
        setBoardData(payload.data as ProjectJourneyBoardData);
      } catch (err) {
        if (!isMounted || controller.signal.aborted) {
          return;
        }
        console.error("Failed to load project journey data", err);
        setBoardData(getMockProjectJourneyData(projectId));
        setError(err instanceof Error ? err.message : "Unable to load project data");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [projectId]);

  useEffect(() => {
    if (!boardData) {
      return;
    }
    setEditValues({
      name: boardData.projectName,
      description: boardData.projectDescription ?? boardData.projectGoal ?? "",
      status: boardData.projectStatus ?? "active",
      startDate: toInputDate(boardData.projectStartDate),
      endDate: toInputDate(boardData.projectEndDate),
      systemPrompt: boardData.projectSystemPrompt ?? "",
    });
  }, [boardData]);

  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!boardData) {
      setActiveChallengeId(null);
      return;
    }

    if (activeChallengeId && boardData.challenges.some(challenge => challenge.id === activeChallengeId)) {
      return;
    }

    setActiveChallengeId(boardData.challenges[0]?.id ?? null);
  }, [boardData, activeChallengeId]);

  const allChallenges = useMemo(() => (boardData ? flattenChallenges(boardData.challenges) : []), [boardData]);

  const parentChallengeOptions = useMemo(() => {
    if (!boardData) {
      return [] as { id: string; label: string }[];
    }

    const options: { id: string; label: string }[] = [];

    const traverse = (nodes: ProjectChallengeNode[], depth: number) => {
      nodes.forEach(node => {
        const indent = depth > 0 ? `${"\u00A0".repeat(depth * 2)}↳ ` : "";
        options.push({
          id: node.id,
          label: `${indent}${node.title}`,
        });

        if (node.children?.length) {
          traverse(node.children, depth + 1);
        }
      });
    };

    traverse(boardData.challenges, 0);
    return options;
  }, [boardData]);

  const selectedParentChallenge = useMemo(() => {
    if (!challengeFormValues.parentId) {
      return null;
    }

    return allChallenges.find(challenge => challenge.id === challengeFormValues.parentId) ?? null;
  }, [allChallenges, challengeFormValues.parentId]);

  const challengeInsightMap = useMemo(() => {
    if (!boardData) {
      return new Map<string, ChallengeInsightRow[]>();
    }
    const map = new Map<string, ChallengeInsightRow[]>();
    boardData.asks.forEach(ask => {
      ask.participants.forEach(participant => {
        participant.insights.forEach(insight => {
          const baseContributors =
            insight.contributors?.length
              ? insight.contributors
              : [{ id: participant.id, name: participant.name, role: participant.role }];

          insight.relatedChallengeIds.forEach(challengeId => {
            const rows = map.get(challengeId) ?? [];
            const existingIndex = rows.findIndex(row => row.id === insight.id && row.askId === ask.id);

            if (existingIndex >= 0) {
              rows[existingIndex] = {
                ...rows[existingIndex],
                contributors: mergeContributors(rows[existingIndex].contributors, baseContributors),
              };
            } else {
              rows.push({
                ...insight,
                contributors: baseContributors,
                askId: ask.id,
                askTitle: ask.title,
              });
            }

            map.set(challengeId, rows);
          });
        });
      });
    });
    return map;
  }, [boardData]);

  const asksByChallenge = useMemo(() => {
    if (!boardData) {
      return new Map<string, ProjectAskOverview[]>();
    }
    const map = new Map<string, ProjectAskOverview[]>();
    boardData.asks.forEach(ask => {
      ask.originatingChallengeIds.forEach(challengeId => {
        const list = map.get(challengeId) ?? [];
        list.push(ask);
        map.set(challengeId, list);
      });
    });
    return map;
  }, [boardData]);

  const activeChallenge = useMemo(
    () => (activeChallengeId ? allChallenges.find(challenge => challenge.id === activeChallengeId) ?? null : null),
    [activeChallengeId, allChallenges],
  );

  const activeChallengeInsights = useMemo(
    () => (activeChallengeId ? challengeInsightMap.get(activeChallengeId) ?? [] : []),
    [challengeInsightMap, activeChallengeId],
  );

  const activeChallengeAsks = useMemo(
    () => (activeChallengeId ? asksByChallenge.get(activeChallengeId) ?? [] : []),
    [asksByChallenge, activeChallengeId],
  );

  useEffect(() => {
    if (activeChallengeId && rightColumnRef.current) {
      rightColumnRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeChallengeId]);

  const renderAskInsights = (ask: ProjectAskOverview) => {
    const insightMap = new Map<string, AskInsightRow>();

    ask.participants.forEach(participant => {
      participant.insights.forEach(insight => {
        const fallbackContributors = [{ id: participant.id, name: participant.name, role: participant.role }];
        const contributors = insight.contributors?.length ? insight.contributors : fallbackContributors;
        const existing = insightMap.get(insight.id);

        if (existing) {
          insightMap.set(insight.id, {
            ...existing,
            contributors: mergeContributors(existing.contributors, contributors),
          });
        } else {
          insightMap.set(insight.id, {
            ...insight,
            contributors,
          });
        }
      });
    });

    const rows = Array.from(insightMap.values());

    if (rows.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          No insights have been published for this ASK yet.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.id} className="rounded-lg border border-white/10 bg-slate-900/70 p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-200">
              <span className={cn("rounded-full border px-2 py-0.5", insightTypeClasses[row.type])}>
                {row.type.toUpperCase()}
              </span>
              <span className="inline-flex items-center gap-1 text-slate-300">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <span className="flex flex-wrap items-center gap-1">
                  {row.contributors.map(contributor => (
                    <span
                      key={contributor.id || contributor.name}
                      className="rounded-full bg-white/10 px-2 py-0.5 font-medium text-white"
                    >
                      {contributor.name}
                    </span>
                  ))}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(row.updatedAt)}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-white">{row.title}</p>
            <p className="mt-1 text-sm text-slate-300">{row.description}</p>
            {row.relatedChallengeIds.length ? (
              <div className="mt-2 text-xs text-slate-400">
                Linked to {row.relatedChallengeIds.length} challenge{row.relatedChallengeIds.length > 1 ? "s" : ""}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  if (!boardData && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-300">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-300" />
        <p>Loading project journey…</p>
      </div>
    );
  }

  if (!boardData) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/70 p-6 text-center text-slate-200">
        Unable to display project data.
      </div>
    );
  }

  const projectStart = formatFullDate(boardData.projectStartDate);
  const projectEnd = formatFullDate(boardData.projectEndDate);

  const handleEditToggle = () => {
    setIsEditingProject(current => !current);
    setFeedback(null);
  };

  const handleInputChange = (field: keyof ProjectEditState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { value } = event.target;
    setEditValues(current => ({ ...current, [field]: value }));
  };

  const resetChallengeFormValues = (overrides?: Partial<ChallengeFormState>) => {
    setChallengeFormValues({
      ...createEmptyChallengeForm(),
      ...overrides,
    });
  };

  const handleChallengeStart = (parent?: ProjectChallengeNode | null) => {
    setIsCreatingChallenge(true);
    setChallengeFeedback(null);
    resetChallengeFormValues({
      parentId: parent?.id ?? "",
      impact: parent?.impact ?? "medium",
    });
  };

  const handleChallengeCancel = () => {
    setIsCreatingChallenge(false);
    setIsSavingChallenge(false);
    setChallengeFeedback(null);
    resetChallengeFormValues();
  };

  const handleChallengeFieldChange = (
    field: Extract<keyof ChallengeFormState, "title" | "description" | "status" | "impact">,
  ) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { value } = event.target;
      setChallengeFormValues(current => ({
        ...current,
        [field]:
          field === "impact"
            ? (value as ChallengeFormState["impact"])
            : field === "status"
              ? (value as ChallengeFormState["status"])
              : value,
      }));
    };

  const handleChallengeParentChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setChallengeFormValues(current => ({
      ...current,
      parentId: value,
    }));
  };

  const handleChallengeOwnerToggle = (ownerId: string) => {
    setChallengeFormValues(current => {
      const hasOwner = current.ownerIds.includes(ownerId);
      return {
        ...current,
        ownerIds: hasOwner ? current.ownerIds.filter(id => id !== ownerId) : [...current.ownerIds, ownerId],
      };
    });
  };

  const handleChallengeSave = async () => {
    if (!boardData) {
      return;
    }

    const trimmedTitle = challengeFormValues.title.trim();
    if (!trimmedTitle) {
      setChallengeFeedback({ type: "error", message: "Please provide a challenge title." });
      return;
    }

    const trimmedDescription = challengeFormValues.description.trim();
    const normalizedStatus = challengeFormValues.status;
    const owners = boardData.availableUsers
      .filter(user => challengeFormValues.ownerIds.includes(user.id))
      .map(user => ({ id: user.id, name: user.name, role: user.role }));
    const fallbackId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `challenge-${Date.now()}`;
    const validImpacts = Object.keys(impactLabels) as ProjectChallengeNode["impact"][];
    const validStatuses = challengeStatusOptions.map(option => option.value) as ChallengeStatus[];
    const normalizedParentId = challengeFormValues.parentId.trim();
    const parentChallenge = normalizedParentId
      ? allChallenges.find(challenge => challenge.id === normalizedParentId) ?? null
      : null;

    const resolvedParentId = normalizedParentId || "";

    const buildChallengeNode = (id: string, overrides?: Partial<ProjectChallengeNode>): ProjectChallengeNode => ({
      id,
      title: overrides?.title ?? trimmedTitle,
      description: overrides?.description ?? trimmedDescription,
      status: overrides?.status ?? normalizedStatus,
      impact: overrides?.impact ?? challengeFormValues.impact,
      owners,
      relatedInsightIds: overrides?.relatedInsightIds ?? [],
      children: [],
    });

    setIsSavingChallenge(true);
    setChallengeFeedback(null);

    try {
      if (USE_MOCK_JOURNEY) {
        const localChallenge = buildChallengeNode(fallbackId);
        setBoardData(current =>
          current
            ? {
                ...current,
                challenges: insertChallengeNode(current.challenges, localChallenge, resolvedParentId || null),
              }
            : current,
        );
        setActiveChallengeId(localChallenge.id);
        setIsCreatingChallenge(false);
        resetChallengeFormValues();
        setChallengeFeedback({
          type: "success",
          message: parentChallenge
            ? `Sub-challenge added under "${parentChallenge.title}".`
            : "Challenge added to the journey.",
        });
        return;
      }

      const payload = {
        name: trimmedTitle,
        description: trimmedDescription,
        status: normalizedStatus,
        priority: challengeFormValues.impact,
        projectId: boardData.projectId,
        assignedTo: owners[0]?.id ?? "",
        parentChallengeId: resolvedParentId,
      };

      const response = await fetch("/api/admin/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to create challenge.");
      }

      const created = result.data as ChallengeRecord;
      const challengeId = created?.id ?? fallbackId;
      const serverImpact = created?.priority && validImpacts.includes(created.priority as ProjectChallengeNode["impact"])
        ? (created.priority as ProjectChallengeNode["impact"])
        : challengeFormValues.impact;
      const serverStatus = created?.status && validStatuses.includes(created.status as ChallengeStatus)
        ? (created.status as ChallengeStatus)
        : normalizedStatus;

      const challengeNode = buildChallengeNode(challengeId, {
        title: created?.name ?? trimmedTitle,
        description: created?.description ?? trimmedDescription,
        status: serverStatus,
        impact: serverImpact,
      });

      setBoardData(current =>
        current
          ? {
              ...current,
              challenges: insertChallengeNode(current.challenges, challengeNode, resolvedParentId || null),
            }
          : current,
      );
      setActiveChallengeId(challengeNode.id);
      setIsCreatingChallenge(false);
      resetChallengeFormValues();
      setChallengeFeedback({
        type: "success",
        message: parentChallenge
          ? `Sub-challenge created under "${parentChallenge.title}".`
          : "Challenge created successfully.",
      });
    } catch (error) {
      console.error("Failed to create challenge", error);
      setChallengeFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to create challenge.",
      });
    } finally {
      setIsSavingChallenge(false);
    }
  };

  const handleLaunchAiChallengeBuilder = (parent?: ProjectChallengeNode | null) => {
    const detail = {
      projectId: boardData?.projectId ?? null,
      parentId: parent?.id ?? null,
      parentTitle: parent?.title ?? null,
    };

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-challenge-builder", { detail }));
    }

    setChallengeFeedback({
      type: "success",
      message: parent
        ? `AI challenge builder launched for "${parent.title}".`
        : "AI challenge builder launched for a new top-level challenge.",
    });
  };

  const renderChallengeList = (nodes: ProjectChallengeNode[], depth = 0) => {
    return (
      <div className={cn("space-y-3", depth > 0 && "border-l border-white/10 pl-4")}
        data-depth={depth}
      >
        {nodes.map(node => {
          const isActive = activeChallengeId === node.id;
          const insightCount = challengeInsightMap.get(node.id)?.length ?? 0;
          const subChallengeCount = countSubChallenges(node);
          const owners = node.owners ?? [];
          const ownerCount = owners.length;

          return (
            <Card
              key={node.id}
              className={cn(
                "border border-white/10 bg-slate-900/60 transition hover:border-indigo-400/70",
                isActive && "border-indigo-400 bg-indigo-500/15 shadow-lg",
              )}
            >
              <button type="button" className="w-full text-left" onClick={() => setActiveChallengeId(node.id)}>
                <div className={cn("flex flex-col gap-2", isActive ? "p-4" : "p-3")}
                  data-active={isActive}
                >
                  {isActive ? (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-2">
                          <CardTitle className="text-lg font-semibold text-white">{node.title}</CardTitle>
                          <p className="text-sm text-slate-300">{node.description}</p>
                        </div>
                        <ChevronRight
                          className={cn(
                            "h-5 w-5 text-slate-500 transition-transform",
                            isActive && "rotate-90 text-indigo-300",
                          )}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-200">
                        <span className={cn("rounded-full border px-2.5 py-1", impactClasses[node.impact])}>
                          {impactLabels[node.impact]}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-slate-200">
                          <Lightbulb className="h-3.5 w-3.5" />
                          {insightCount} insight{insightCount > 1 ? "s" : ""}
                        </span>
                        {subChallengeCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-slate-200">
                            <ChevronRight className="h-3.5 w-3.5" />
                            {subChallengeCount} sub-challenge{subChallengeCount > 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </div>
                      {ownerCount > 0 ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          {owners.map(owner => (
                            <span
                              key={owner.id || owner.name}
                              className="rounded-full bg-white/10 px-2.5 py-1 font-medium text-white"
                            >
                              {owner.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex w-full items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">{node.title}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] font-medium text-slate-400">
                        <span className={cn("rounded-full border px-2 py-0.5", impactClasses[node.impact])}>
                          {impactLabels[node.impact]}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-slate-200">
                          <Lightbulb className="h-3 w-3" />
                          {insightCount}
                        </span>
                        {ownerCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-slate-200">
                            <Users className="h-3 w-3" />
                            {ownerCount > 1 ? `${ownerCount} people` : owners[0]?.name}
                          </span>
                        ) : null}
                        {subChallengeCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-slate-200">
                            <ChevronRight className="h-3 w-3" />
                            {subChallengeCount}
                          </span>
                        ) : null}
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    </div>
                  )}
                </div>
              </button>
              {(isActive || node.children?.length) ? (
                <CardContent className={cn(
                  "border-t border-white/5 bg-slate-900/70",
                  isActive ? "space-y-3" : undefined,
                )}>
                  {isActive ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2 bg-indigo-500 text-white hover:bg-indigo-400"
                        onClick={() => handleChallengeStart(node)}
                      >
                        <Plus className="h-4 w-4" />
                        New sub-challenge
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-2 border-indigo-300/40 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/20"
                        onClick={() => handleLaunchAiChallengeBuilder(node)}
                      >
                        <Sparkles className="h-4 w-4" />
                        Generate with AI
                      </Button>
                    </div>
                  ) : null}
                  {node.children?.length ? (
                    <div className={cn(isActive ? "border-t border-white/5 pt-3" : undefined)}>
                      {renderChallengeList(node.children, depth + 1)}
                    </div>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>
    );
  };

  const handleProjectSave = async () => {
    if (!boardData) {
      return;
    }
    const payload: Record<string, unknown> = {};
    const trimmedName = editValues.name.trim();
    if (trimmedName.length > 0 && trimmedName !== boardData.projectName) {
      payload.name = trimmedName;
    }

    if (editValues.description.trim() !== (boardData.projectDescription ?? boardData.projectGoal ?? "").trim()) {
      payload.description = editValues.description;
    }

    if (editValues.status !== (boardData.projectStatus ?? "")) {
      payload.status = editValues.status;
    }

    if (editValues.startDate && editValues.startDate !== toInputDate(boardData.projectStartDate)) {
      const startDate = new Date(editValues.startDate);
      if (Number.isNaN(startDate.getTime())) {
        setFeedback({ type: "error", message: "Please provide a valid project start date." });
        return;
      }
      payload.startDate = startDate.toISOString();
    }

    if (editValues.endDate && editValues.endDate !== toInputDate(boardData.projectEndDate)) {
      const endDate = new Date(editValues.endDate);
      if (Number.isNaN(endDate.getTime())) {
        setFeedback({ type: "error", message: "Please provide a valid project end date." });
        return;
      }
      payload.endDate = endDate.toISOString();
    }

    if (editValues.systemPrompt !== (boardData.projectSystemPrompt ?? "")) {
      payload.systemPrompt = editValues.systemPrompt;
    }

    if (Object.keys(payload).length === 0) {
      setFeedback({ type: "error", message: "No changes detected." });
      return;
    }

    try {
      setIsSavingProject(true);
      setFeedback(null);
      const response = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to update project");
      }
      const updated = result.data as {
        name: string;
        description?: string | null;
        status: string;
        startDate: string;
        endDate: string;
        systemPrompt?: string | null;
      };

      setBoardData(current =>
        current
          ? {
              ...current,
              projectName: updated.name,
              projectDescription: updated.description ?? null,
              projectGoal: updated.description ?? null,
              projectStatus: updated.status,
              projectStartDate: updated.startDate,
              projectEndDate: updated.endDate,
              projectSystemPrompt: updated.systemPrompt ?? null,
              timeframe: formatTimeframe(updated.startDate, updated.endDate),
            }
          : current,
      );

      setFeedback({ type: "success", message: "Project updated successfully." });
      setIsEditingProject(false);
    } catch (err) {
      console.error("Failed to update project", err);
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Unable to update project.",
      });
    } finally {
      setIsSavingProject(false);
    }
  };

  return (
    <div className="space-y-8 text-slate-100">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Live data unavailable</AlertTitle>
          <AlertDescription>
            {error}. Showing mock data so you can continue designing the experience.
          </AlertDescription>
        </Alert>
      ) : null}

      {feedback ? (
        <Alert variant={feedback.type === "success" ? "default" : "destructive"}>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      <header className="rounded-xl border border-white/10 bg-slate-900/70 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-indigo-200">Project</p>
            <h1 className="text-2xl font-semibold text-white">{boardData.projectName}</h1>
            {boardData.clientName ? (
              <p className="mt-1 text-sm text-slate-300">Client: {boardData.clientName}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isEditingProject ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleProjectSave}
                  disabled={isSavingProject}
                  className="gap-2"
                >
                  {isSavingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save changes
                </Button>
                <Button size="sm" variant="outline" onClick={handleEditToggle} disabled={isSavingProject} className="gap-2">
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={handleEditToggle} className="gap-2">
                <Pencil className="h-4 w-4" />
                Edit project
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
            <p className="mt-1 text-sm font-medium text-slate-100 capitalize">
              {boardData.projectStatus ?? "unknown"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Timeline</p>
            <p className="mt-1 text-sm font-medium text-slate-100">
              {boardData.timeframe ?? "Not specified"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Start date</p>
            <p className="mt-1 text-sm font-medium text-slate-100">{projectStart ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">End date</p>
            <p className="mt-1 text-sm font-medium text-slate-100">{projectEnd ?? "—"}</p>
          </div>
        </div>

        {boardData.projectDescription ? (
          <p className="mt-4 text-sm text-slate-300">{boardData.projectDescription}</p>
        ) : null}

        {boardData.projectSystemPrompt && !isEditingProject ? (
          <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
            <p className="mb-2 font-semibold text-slate-100">Project system prompt</p>
            <pre className="whitespace-pre-wrap leading-relaxed text-slate-200">{boardData.projectSystemPrompt}</pre>
          </div>
        ) : null}
      </header>

      {isEditingProject ? (
        <Card className="border border-white/15 bg-slate-900/70">
          <CardHeader>
            <CardTitle>Edit project details</CardTitle>
            <p className="text-sm text-slate-300">Adjust the information below, including the system prompt used by the AI.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={editValues.name}
                  onChange={handleInputChange("name")}
                  placeholder="Project name"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-status">Status</Label>
                <Input
                  id="project-status"
                  value={editValues.status}
                  onChange={handleInputChange("status")}
                  placeholder="active"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-start">Start date</Label>
                <Input
                  id="project-start"
                  type="datetime-local"
                  value={editValues.startDate}
                  onChange={handleInputChange("startDate")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-end">End date</Label>
                <Input
                  id="project-end"
                  type="datetime-local"
                  value={editValues.endDate}
                  onChange={handleInputChange("endDate")}
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-2">
                <Label htmlFor="project-description">Description</Label>
                <Textarea
                  id="project-description"
                  rows={3}
                  value={editValues.description}
                  onChange={handleInputChange("description")}
                  placeholder="What is the goal of this project?"
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-2">
                <Label htmlFor="project-prompt">System prompt</Label>
                <Textarea
                  id="project-prompt"
                  rows={6}
                  value={editValues.systemPrompt}
                  onChange={handleInputChange("systemPrompt")}
                  placeholder="Provide the system prompt used by the AI for this project"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>
                {'Tip: keep the system prompt concise and use placeholders such as {{project_name}} or {{client_name}} to reuse across projects.'}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
        <div className="lg:max-h-[70vh] lg:overflow-y-auto lg:pr-2">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Project challenges</h2>
                <p className="text-sm text-slate-300">
                  Select a challenge to explore the insights that shaped it and the ASKs linked to its resolution.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-indigo-300/40 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/20"
                  onClick={() => handleLaunchAiChallengeBuilder(null)}
                >
                  <Sparkles className="h-4 w-4" />
                  Launch AI challenge builder
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 bg-indigo-500 text-white hover:bg-indigo-400"
                  onClick={() => handleChallengeStart(null)}
                  disabled={isCreatingChallenge || isSavingChallenge}
                >
                  <Plus className="h-4 w-4" />
                  New challenge
                </Button>
              </div>
            </div>
            {challengeFeedback ? (
              <Alert variant={challengeFeedback.type === "success" ? "default" : "destructive"}>
                <AlertDescription>{challengeFeedback.message}</AlertDescription>
              </Alert>
            ) : null}

            {isCreatingChallenge ? (
              <Card className="border border-indigo-300/40 bg-slate-900/70">
                <CardHeader>
                  <CardTitle>Create a new challenge</CardTitle>
                  <p className="text-sm text-slate-300">
                    Provide a clear title, status and description so collaborators can respond effectively.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="challenge-title">Title</Label>
                      <Input
                        id="challenge-title"
                        value={challengeFormValues.title}
                        onChange={handleChallengeFieldChange("title")}
                        placeholder="What problem are you addressing?"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="challenge-status">Status</Label>
                      <select
                        id="challenge-status"
                        value={challengeFormValues.status}
                        onChange={handleChallengeFieldChange("status")}
                        className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                      >
                        {challengeStatusOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="challenge-impact">Impact</Label>
                      <select
                        id="challenge-impact"
                        value={challengeFormValues.impact}
                        onChange={handleChallengeFieldChange("impact")}
                        className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                      >
                        {(Object.entries(impactLabels) as [ProjectChallengeNode["impact"], string][]).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(parentChallengeOptions.length > 0 || challengeFormValues.parentId) ? (
                      <div className="md:col-span-2 flex flex-col gap-2">
                        <Label htmlFor="challenge-parent">Parent challenge</Label>
                        <select
                          id="challenge-parent"
                          value={challengeFormValues.parentId}
                          onChange={handleChallengeParentChange}
                          className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                        >
                          <option value="">No parent (top-level)</option>
                          {parentChallengeOptions.map(option => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-400">
                          {challengeFormValues.parentId
                            ? selectedParentChallenge
                              ? `This challenge will be nested under "${selectedParentChallenge.title}".`
                              : "This challenge will be nested under the selected parent."
                            : "Leave empty to create a top-level challenge."}
                        </p>
                      </div>
                    ) : null}
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <Label htmlFor="challenge-description">Description</Label>
                      <Textarea
                        id="challenge-description"
                        rows={3}
                        value={challengeFormValues.description}
                        onChange={handleChallengeFieldChange("description")}
                        placeholder="Provide useful context so the team understands the challenge."
                      />
                    </div>
                  </div>
                  {boardData.availableUsers.length ? (
                    <div className="flex flex-col gap-2">
                      <Label>Owners</Label>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {boardData.availableUsers.map(user => {
                          const isSelected = challengeFormValues.ownerIds.includes(user.id);
                          return (
                            <label
                              key={user.id}
                              className={cn(
                                "inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-slate-950/60 px-3 py-2 text-sm transition",
                                isSelected
                                  ? "border-indigo-400/70 bg-indigo-500/10 text-indigo-100"
                                  : "border-white/10 text-slate-200 hover:border-indigo-300/50",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleChallengeOwnerToggle(user.id)}
                                className="h-4 w-4 rounded border-white/30 bg-slate-900 text-indigo-500 focus:ring-indigo-400"
                              />
                              <span className="flex flex-col leading-tight">
                                <span className="font-medium text-white">{user.name}</span>
                                {user.role ? <span className="text-xs text-slate-400">{user.role}</span> : null}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      className="gap-2 bg-indigo-500 text-white hover:bg-indigo-400"
                      onClick={handleChallengeSave}
                      disabled={isSavingChallenge || !challengeFormValues.title.trim()}
                    >
                      {isSavingChallenge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save challenge
                    </Button>
                    <Button type="button" variant="outline" onClick={handleChallengeCancel} disabled={isSavingChallenge} className="gap-2">
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {boardData.challenges.length ? (
              renderChallengeList(boardData.challenges)
            ) : (
              <Card className="border-dashed border-white/10 bg-slate-900/60">
                <CardContent className="py-10 text-center text-sm text-slate-300">
                  No challenges have been defined for this project yet.
                </CardContent>
              </Card>
            )}
          </section>
        </div>

        <div ref={rightColumnRef} className="lg:max-h-[70vh] lg:overflow-y-auto lg:pl-2">
          <section className="space-y-4">
            {!activeChallenge ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-white">Select a challenge</h2>
                  <p className="text-sm text-slate-300">
                    Review the ASKs planned for a challenge, along with the insights and project relationships they generate.
                  </p>
                </div>
                <Card className="border-dashed border-white/10 bg-slate-900/60">
                  <CardContent className="py-10 text-center text-sm text-slate-300">
                    Choose a challenge from the list on the left to see its details.
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card className="border border-white/10 bg-slate-900/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-white">
                      Foundational insights
                    </CardTitle>
                    <p className="text-sm text-slate-300">
                      These insights contributed to framing the challenge "{activeChallenge.title}".
                    </p>
                  </CardHeader>
                  <CardContent>
                    {activeChallengeInsights.length ? (
                      <div className="space-y-3">
                        {activeChallengeInsights.map(insight => (
                          <div
                            key={`${insight.id}-${insight.askId}`}
                            className="rounded-lg border border-white/10 bg-slate-900/70 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-200">
                              <span className={cn("rounded-full border px-2 py-0.5", insightTypeClasses[insight.type])}>
                                {insight.type.toUpperCase()}
                              </span>
                              <span className="inline-flex items-center gap-1 text-slate-300">
                                <Users className="h-3.5 w-3.5 text-slate-400" />
                                <span className="flex flex-wrap items-center gap-1">
                                  {insight.contributors.map(contributor => (
                                    <span
                                      key={contributor.id || contributor.name}
                                      className="rounded-full bg-white/10 px-2 py-0.5 font-medium text-white"
                                    >
                                      {contributor.name}
                                    </span>
                                  ))}
                                </span>
                              </span>
                              <span className="inline-flex items-center gap-1 text-slate-400">
                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                {formatDate(insight.updatedAt)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-slate-300">
                                <Lightbulb className="h-3.5 w-3.5 text-indigo-300" />
                                ASK: {insight.askTitle}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-white">{insight.title}</p>
                            <p className="mt-1 text-sm text-slate-300">{insight.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                        No insights are linked to this challenge yet.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 shadow-sm">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      ASKs linked to "{activeChallenge.title}"
                    </h2>
                    <p className="text-sm text-slate-300">
                      Review the ASK sessions planned for this challenge, including the insights gathered and related projects.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="gap-2 bg-indigo-500 text-white hover:bg-indigo-400">
                      <Plus className="h-4 w-4" />
                      Create ASK
                    </Button>
                    <Button size="sm" variant="outline" className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20">
                      <Sparkles className="h-4 w-4" />
                      Generate ASKs with AI
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  {activeChallengeAsks.length ? (
                    activeChallengeAsks.map(ask => (
                      <Card key={ask.id} className="border border-white/10 bg-slate-900/70 shadow-sm">
                        <CardHeader className="space-y-3 pb-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <CardTitle className="text-base font-semibold text-white">{ask.title}</CardTitle>
                              <p className="mt-1 text-sm text-slate-300">{ask.summary}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 text-xs text-slate-400">
                              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 font-medium text-slate-100">
                                <Calendar className="h-3.5 w-3.5 text-slate-200" /> Due {formatDate(ask.dueDate)}
                              </span>
                              <span className="text-slate-300">Status: {ask.status}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-slate-200">
                              <Target className="h-3.5 w-3.5 text-indigo-300" /> General theme
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-slate-200">
                              <Users className="h-3.5 w-3.5 text-slate-200" /> {ask.participants.length} participant{ask.participants.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span className="font-semibold text-slate-300">Related projects:</span>
                            {ask.relatedProjects.length ? (
                              ask.relatedProjects.map(project => (
                                <span
                                  key={project.id}
                                  className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-slate-100"
                                >
                                  {project.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400">Current project only</span>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <h3 className="text-sm font-semibold text-slate-200">Collected insights</h3>
                          {renderAskInsights(ask)}
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="border-dashed border-white/10 bg-slate-900/60">
                      <CardContent className="py-10 text-center text-sm text-slate-300">
                        No ASK sessions are linked to this challenge yet.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
