"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Calendar,
  ChevronRight,
  MessageSquare,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
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
  type AiAskGeneratorResponse,
  type AiAskSuggestion,
  type AiChallengeBuilderResponse,
  type AiChallengeUpdateSuggestion,
  type AiNewChallengeSuggestion,
  type AskAudienceScope,
  type AskDeliveryMode,
  type AskGroupResponseMode,
  type AskSessionRecord,
  type ChallengeRecord,
  type ProjectAskOverview,
  type ProjectChallengeNode,
  type ProjectJourneyBoardData,
  type ProjectParticipantInsight,
  type ProjectParticipantSummary,
} from "@/types";
import { AiChallengeBuilderPanel } from "@/components/project/AiChallengeBuilderPanel";
import { AiAskGeneratorPanel } from "@/components/project/AiAskGeneratorPanel";

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

const askStatusOptions = ["active", "inactive", "draft", "closed"] as const;
const askDeliveryModes: AskDeliveryMode[] = ["physical", "digital"];
const askAudienceScopes: AskAudienceScope[] = ["individual", "group"];
const askResponseModes: AskGroupResponseMode[] = ["collective", "simultaneous"];

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

function buildChallengeParentMap(nodes: ProjectChallengeNode[]): Map<string, string | null> {
  const map = new Map<string, string | null>();

  const traverse = (items: ProjectChallengeNode[], parentId: string | null) => {
    items.forEach(item => {
      map.set(item.id, parentId);
      if (item.children?.length) {
        traverse(item.children, item.id);
      }
    });
  };

  traverse(nodes, null);
  return map;
}

function buildChallengeDescendantsMap(nodes: ProjectChallengeNode[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  const collect = (item: ProjectChallengeNode): Set<string> => {
    const descendants = new Set<string>();

    item.children?.forEach(child => {
      descendants.add(child.id);
      const childDescendants = collect(child);
      childDescendants.forEach(id => descendants.add(id));
    });

    map.set(item.id, descendants);
    return descendants;
  };

  nodes.forEach(node => {
    collect(node);
  });

  return map;
}

function removeChallengeNode(
  nodes: ProjectChallengeNode[],
  targetId: string,
): readonly [ProjectChallengeNode[], ProjectChallengeNode | null] {
  let removed: ProjectChallengeNode | null = null;

  const nextNodes = nodes
    .map(node => {
      if (node.id === targetId) {
        removed = node;
        return null;
      }

      if (node.children?.length) {
        const [children, extracted] = removeChallengeNode(node.children, targetId);
        if (extracted) {
          removed = extracted;
          return { ...node, children };
        }
      }

      return node;
    })
    .filter((value): value is ProjectChallengeNode => value !== null);

  return [nextNodes, removed] as const;
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

type AskFormState = {
  challengeId: string;
  askKey: string;
  name: string;
  question: string;
  description: string;
  status: (typeof askStatusOptions)[number];
  startDate: string;
  endDate: string;
  isAnonymous: boolean;
  maxParticipants: string;
  participantIds: string[];
  spokespersonId: string;
  deliveryMode: AskDeliveryMode;
  audienceScope: AskAudienceScope;
  responseMode: AskGroupResponseMode;
};

function generateAskKey(base: string) {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `${slug || "ask"}-${randomSuffix}`;
}

function createEmptyAskForm(challengeId?: string): AskFormState {
  const now = new Date();
  const defaultStart = now.toISOString().slice(0, 16);
  const defaultEnd = new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);

  return {
    challengeId: challengeId ?? "",
    askKey: generateAskKey("ask"),
    name: "",
    question: "",
    description: "",
    status: "active",
    startDate: defaultStart,
    endDate: defaultEnd,
    isAnonymous: false,
    maxParticipants: "",
    participantIds: [],
    spokespersonId: "",
    deliveryMode: "digital",
    audienceScope: "individual",
    responseMode: "collective",
  };
}

function normalizeAskStatus(value?: string | null): AskFormState["status"] {
  if (!value) {
    return "active";
  }
  const normalized = value as (typeof askStatusOptions)[number];
  return askStatusOptions.includes(normalized) ? normalized : "active";
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
  const [isChallengeFormVisible, setIsChallengeFormVisible] = useState(false);
  const [challengeFormMode, setChallengeFormMode] = useState<"create" | "edit">("create");
  const [isSavingChallenge, setIsSavingChallenge] = useState(false);
  const [challengeFeedback, setChallengeFeedback] = useState<FeedbackState | null>(null);
  const [challengeFormValues, setChallengeFormValues] = useState<ChallengeFormState>(() => createEmptyChallengeForm());
  const [editingChallengeId, setEditingChallengeId] = useState<string | null>(null);
  const isEditingChallenge = challengeFormMode === "edit" && Boolean(editingChallengeId);
  const [isAskFormOpen, setIsAskFormOpen] = useState(false);
  const [isEditingAsk, setIsEditingAsk] = useState(false);
  const [editingAskId, setEditingAskId] = useState<string | null>(null);
  const [askFeedback, setAskFeedback] = useState<FeedbackState | null>(null);
  const [askFormValues, setAskFormValues] = useState<AskFormState>(() => createEmptyAskForm());
  const [isSavingAsk, setIsSavingAsk] = useState(false);
  const [hasManualAskKey, setHasManualAskKey] = useState(false);
  const [askDetails, setAskDetails] = useState<Record<string, AskSessionRecord>>({});
  const [isLoadingAskDetails, setIsLoadingAskDetails] = useState(false);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);
  const [editValues, setEditValues] = useState<ProjectEditState>({
    name: "",
    description: "",
    status: "active",
    startDate: "",
    endDate: "",
    systemPrompt: "",
  });
  const [aiSuggestions, setAiSuggestions] = useState<AiChallengeUpdateSuggestion[]>([]);
  const [aiNewChallenges, setAiNewChallenges] = useState<AiNewChallengeSuggestion[]>([]);
  const [aiBuilderErrors, setAiBuilderErrors] = useState<Array<{ challengeId: string | null; message: string }> | null>(null);
  const [aiBuilderFeedback, setAiBuilderFeedback] = useState<FeedbackState | null>(null);
  const [isAiBuilderRunning, setIsAiBuilderRunning] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [applyingChallengeIds, setApplyingChallengeIds] = useState<Set<string>>(() => new Set());
  const [applyingNewChallengeIndices, setApplyingNewChallengeIndices] = useState<Set<number>>(() => new Set());
  const [isAskAiPanelOpen, setIsAskAiPanelOpen] = useState(false);
  const [isAskAiRunning, setIsAskAiRunning] = useState(false);
  const [askAiSuggestions, setAskAiSuggestions] = useState<AiAskSuggestion[]>([]);
  const [askAiFeedback, setAskAiFeedback] = useState<FeedbackState | null>(null);
  const [askAiErrors, setAskAiErrors] = useState<string[] | null>(null);

  useEffect(() => {
    if (challengeFeedback?.type !== "success") {
      return;
    }

    const timeoutId = window.setTimeout(() => setChallengeFeedback(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [challengeFeedback]);

  useEffect(() => {
    if (!aiBuilderFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setAiBuilderFeedback(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [aiBuilderFeedback]);

  useEffect(() => {
    if (!askAiFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setAskAiFeedback(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [askAiFeedback]);

  const loadJourneyData = useCallback(
    async (options?: { signal?: AbortSignal; silent?: boolean }) => {
      if (USE_MOCK_JOURNEY) {
        setBoardData(getMockProjectJourneyData(projectId));
        setError(null);
        setIsLoading(false);
        return;
      }

      if (!options?.silent) {
        setIsLoading(true);
        if (!USE_MOCK_JOURNEY) {
          setBoardData(null);
        }
      }
      setError(null);

      try {
        console.log('🔄 Frontend: Reloading journey data for project:', projectId);
        const response = await fetch(`/api/admin/projects/${projectId}/journey`, {
          cache: "no-store",
          credentials: "include",
          signal: options?.signal,
        });
        const payload = await response.json();

        console.log('📡 Frontend: Journey data response:', { status: response.status, success: payload.success });

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to load project data");
        }

        console.log('✅ Frontend: Journey data loaded successfully:', payload.data);
        
        // Debug: Check the structure of the data
        if (payload.data && typeof payload.data === 'object') {
          console.log('🔍 Frontend: Data structure check:', {
            hasProject: !!payload.data.project,
            hasChallenges: !!payload.data.challenges,
            hasAsks: !!payload.data.asks,
            hasParticipants: !!payload.data.participants,
            challengesLength: payload.data.challenges?.length,
            asksLength: payload.data.asks?.length,
            participantsLength: payload.data.participants?.length
          });
        } else {
          console.log('❌ Frontend: Invalid data structure:', payload.data);
        }
        
        setBoardData(payload.data as ProjectJourneyBoardData);
      } catch (err) {
        if (options?.signal?.aborted) {
          return;
        }
        if ((err as { name?: string }).name === "AbortError") {
          return;
        }
        console.error("Failed to load project journey data", err);
        if (USE_MOCK_JOURNEY) {
          setBoardData(getMockProjectJourneyData(projectId));
        } else if (!options?.silent) {
          setBoardData(null);
        }
        setError(err instanceof Error ? err.message : "Unable to load project data");
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [projectId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadJourneyData({ signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [loadJourneyData]);

  const ensureAskDetails = useCallback(
    async (askId: string): Promise<AskSessionRecord> => {
      const existing = askDetails[askId];
      if (existing) {
        return existing;
      }

      const response = await fetch(`/api/admin/asks/${askId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load ASK details");
      }

      const record = payload.data as AskSessionRecord;
      setAskDetails(current => ({ ...current, [record.id]: record }));
      return record;
    },
    [askDetails],
  );

  const allChallenges = useMemo(() => (boardData ? flattenChallenges(boardData.challenges) : []), [boardData]);

  const challengeById = useMemo(() => {
    const map = new Map<string, ProjectChallengeNode>();
    allChallenges.forEach(challenge => {
      map.set(challenge.id, challenge);
    });
    return map;
  }, [allChallenges]);

  const resolveOwnerId = useCallback(
    (owners?: ProjectParticipantSummary[] | null) => {
      if (!boardData || !owners?.length) {
        return "";
      }

      const availableUsers = boardData.availableUsers ?? [];

      for (const owner of owners) {
        if (owner.id && availableUsers.some(user => user.id === owner.id)) {
          return owner.id;
        }

        const normalizedName = owner.name?.toLowerCase();
        if (normalizedName) {
          const match = availableUsers.find(user => user.name.toLowerCase() === normalizedName);
          if (match) {
            return match.id;
          }
        }
      }

      return "";
    },
    [boardData],
  );

  const handleLaunchAiChallengeBuilder = useCallback(async () => {
    if (isAiBuilderRunning) {
      return;
    }

    setIsAiPanelOpen(true);
    setAiBuilderFeedback(null);
    setAiBuilderErrors(null);
    setAiSuggestions([]);
    setAiNewChallenges([]);
    setIsAiBuilderRunning(true);

    try {
      const response = await fetch(`/api/admin/projects/${projectId}/ai/challenge-builder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to run AI challenge builder.");
      }

      const data = payload.data as AiChallengeBuilderResponse | undefined;

      setAiSuggestions(data?.challengeSuggestions ?? []);
      setAiNewChallenges(data?.newChallengeSuggestions ?? []);
      setAiBuilderErrors(data?.errors ?? null);

      const totalSuggestions = (data?.challengeSuggestions?.length ?? 0) + (data?.newChallengeSuggestions?.length ?? 0);
      if (totalSuggestions === 0) {
        setAiBuilderFeedback({
          type: "error",
          message: "L'agent n'a proposé aucune modification pour ce projet.",
        });
      } else {
        setAiBuilderFeedback({
          type: "success",
          message: "Analyse terminée. Passez en revue les recommandations de l'IA.",
        });
      }
    } catch (error) {
      setAiBuilderFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Erreur inattendue lors de l'analyse IA.",
      });
      setAiBuilderErrors([{ challengeId: null, message: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setIsAiBuilderRunning(false);
    }
  }, [isAiBuilderRunning, projectId]);

  const handleLaunchAskAiGenerator = useCallback(async () => {
    if (isAskAiRunning) {
      return;
    }

    if (!activeChallengeId) {
      setAskAiFeedback({
        type: "error",
        message: "Select a challenge before generating ASKs with AI.",
      });
      return;
    }

    setIsAskAiPanelOpen(true);
    setAskAiFeedback(null);
    setAskAiErrors(null);
    setAskAiSuggestions([]);
    setIsAskAiRunning(true);

    try {
      const response = await fetch(`/api/admin/challenges/${activeChallengeId}/ai/ask-generator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to generate ASKs with AI.");
      }

      const data = (payload.data ?? null) as AiAskGeneratorResponse | null;
      const suggestions = data?.suggestions ?? [];

      setAskAiSuggestions(suggestions);
      setAskAiErrors(data?.errors ?? null);

      if (suggestions.length === 0) {
        setAskAiFeedback({
          type: "error",
          message: "L'agent n'a proposé aucune nouvelle ASK pour ce challenge.",
        });
      } else {
        setAskAiFeedback({
          type: "success",
          message: "ASKs générées. Passez en revue les propositions et appliquez celles qui conviennent.",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inattendue lors de la génération des ASKs.";
      setAskAiFeedback({ type: "error", message });
      setAskAiErrors([message]);
    } finally {
      setIsAskAiRunning(false);
    }
  }, [activeChallengeId, isAskAiRunning]);

  const handleDismissChallengeSuggestion = useCallback((challengeId: string) => {
    setAiSuggestions(current => current.filter(item => item.challengeId !== challengeId));
  }, []);

  const handleDismissNewChallengeSuggestion = useCallback((index: number) => {
    setAiNewChallenges(current => current.filter((_, candidateIndex) => candidateIndex !== index));
  }, []);

  const handleDismissAskSuggestion = useCallback((index: number) => {
    setAskAiSuggestions(current => current.filter((_, candidateIndex) => candidateIndex !== index));
  }, []);

  const handleApplyChallengeSuggestion = useCallback(
    async (suggestion: AiChallengeUpdateSuggestion) => {
      if (!boardData) {
        return;
      }

      setApplyingChallengeIds(current => {
        const next = new Set(current);
        next.add(suggestion.challengeId);
        return next;
      });
      setAiBuilderFeedback(null);

      try {
        const pending: Array<Promise<void>> = [];
        const baseChallenge = challengeById.get(suggestion.challengeId);

        if (suggestion.updates) {
          const payload: Record<string, unknown> = {};
          if (suggestion.updates.title && suggestion.updates.title !== baseChallenge?.title) {
            payload.name = suggestion.updates.title;
          }
          if (suggestion.updates.description && suggestion.updates.description !== baseChallenge?.description) {
            payload.description = suggestion.updates.description;
          }
          if (suggestion.updates.status && suggestion.updates.status !== baseChallenge?.status) {
            payload.status = suggestion.updates.status;
          }
          if (suggestion.updates.impact && suggestion.updates.impact !== baseChallenge?.impact) {
            payload.priority = suggestion.updates.impact;
          }
          const ownerId = resolveOwnerId(suggestion.updates.owners ?? null);
          if (ownerId) {
            payload.assignedTo = ownerId;
          }

          if (Object.keys(payload).length > 0) {
            pending.push(
              fetch(`/api/admin/challenges/${suggestion.challengeId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              }).then(async response => {
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.success) {
                  throw new Error(result.error || `Échec de la mise à jour du challenge ${suggestion.challengeTitle}.`);
                }
              }),
            );
          }
        }

        if (suggestion.subChallengeUpdates?.length) {
          suggestion.subChallengeUpdates.forEach(update => {
            const currentChallenge = challengeById.get(update.id);
            if (!currentChallenge) {
              return;
            }

            const payload: Record<string, unknown> = {};
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

            if (Object.keys(payload).length > 0) {
              pending.push(
                fetch(`/api/admin/challenges/${update.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                }).then(async response => {
                  const result = await response.json().catch(() => ({}));
                  if (!response.ok || !result.success) {
                    throw new Error(result.error || `Échec de la mise à jour du sous-challenge ${update.id}.`);
                  }
                }),
              );
            }
          });
        }

        if (suggestion.newSubChallenges?.length) {
          suggestion.newSubChallenges.forEach(newChallenge => {
            const parentId = newChallenge.parentId ?? suggestion.challengeId;
            const parent = challengeById.get(parentId) ?? baseChallenge;
            const payload: Record<string, unknown> = {
              name: newChallenge.title,
              description: newChallenge.description ?? "",
              status: newChallenge.status ?? parent?.status ?? "open",
              priority: newChallenge.impact ?? parent?.impact ?? "medium",
              projectId: boardData.projectId,
              parentChallengeId: parentId || "",
            };
            const ownerId = resolveOwnerId(newChallenge.owners ?? null);
            if (ownerId) {
              payload.assignedTo = ownerId;
            }

            pending.push(
              fetch("/api/admin/challenges", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              }).then(async response => {
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.success) {
                  throw new Error(result.error || `Échec de la création du sous-challenge ${newChallenge.title}.`);
                }
              }),
            );
          });
        }

        if (pending.length > 0) {
          await Promise.all(pending);
          await loadJourneyData({ silent: true });
        }

        setAiSuggestions(current => current.filter(item => item.challengeId !== suggestion.challengeId));
        setAiBuilderFeedback({
          type: "success",
          message: `Recommandations appliquées à « ${suggestion.challengeTitle} ».`,
        });
      } catch (error) {
        setAiBuilderFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "Impossible d'appliquer les recommandations IA.",
        });
      } finally {
        setApplyingChallengeIds(current => {
          const next = new Set(current);
          next.delete(suggestion.challengeId);
          return next;
        });
      }
    },
    [boardData, challengeById, loadJourneyData, resolveOwnerId],
  );

  const handleApplyNewChallengeSuggestion = useCallback(
    async (suggestion: AiNewChallengeSuggestion, index: number) => {
      if (!boardData) {
        return;
      }

      setApplyingNewChallengeIndices(current => {
        const next = new Set(current);
        next.add(index);
        return next;
      });
      setAiBuilderFeedback(null);

      try {
        const parentId = suggestion.parentId ?? "";
        const parent = parentId ? challengeById.get(parentId) ?? null : null;
        const payload: Record<string, unknown> = {
          name: suggestion.title,
          description: suggestion.description ?? "",
          status: suggestion.status ?? parent?.status ?? "open",
          priority: suggestion.impact ?? parent?.impact ?? "medium",
          projectId: boardData.projectId,
          parentChallengeId: parentId,
        };
        const ownerId = resolveOwnerId(suggestion.owners ?? null);
        if (ownerId) {
          payload.assignedTo = ownerId;
        }

        // 1️⃣ Créer le challenge
        const response = await fetch("/api/admin/challenges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.error || `Échec de la création du challenge ${suggestion.title}.`);
        }

        const newChallengeId = result.data?.id;

        // 2️⃣ Créer les foundation insights si présents
        if (newChallengeId && suggestion.foundationInsights?.length) {
          console.log('🔍 Creating foundation insights for challenge:', {
            challengeId: newChallengeId,
            insightCount: suggestion.foundationInsights.length,
            insights: suggestion.foundationInsights,
          });
          
          try {
            const applyResponse = await fetch(`/api/admin/projects/${boardData.projectId}/ai/challenge-builder/apply`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                challengeId: newChallengeId,
                foundationInsights: suggestion.foundationInsights,
              }),
            });
            
            console.log('📡 Foundation insights API response:', {
              status: applyResponse.status,
              ok: applyResponse.ok,
            });
            
            if (!applyResponse.ok) {
              const errorText = await applyResponse.text();
              console.error("❌ Failed to create foundation insights:", errorText);
              // Note: on continue quand même car le challenge est créé
            } else {
              const applyResult = await applyResponse.json();
              console.log('✅ Foundation insights created successfully:', applyResult);
            }
          } catch (insightError) {
            console.error("❌ Error creating foundation insights:", insightError);
            // On continue même si les insights échouent
          }
        } else {
          console.log('⚠️ No foundation insights to create:', {
            hasNewChallengeId: !!newChallengeId,
            hasFoundationInsights: !!suggestion.foundationInsights,
            foundationInsightsLength: suggestion.foundationInsights?.length,
          });
        }

        await loadJourneyData({ silent: true });
        
        // Sélectionner automatiquement le challenge nouvellement créé
        if (newChallengeId) {
          console.log('🎯 Auto-selecting newly created challenge:', newChallengeId);
          setActiveChallengeId(newChallengeId);
          
          // Scroll vers la section des insights (si possible)
          setTimeout(() => {
            rightColumnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 300);
        }
        
        setAiNewChallenges(current => current.filter((_, candidateIndex) => candidateIndex !== index));
        
        const insightCount = suggestion.foundationInsights?.length || 0;
        const insightMessage = insightCount > 0 ? ` avec ${insightCount} foundation insight${insightCount > 1 ? 's' : ''}` : '';
        
        setAiBuilderFeedback({
          type: "success",
          message: `Challenge « ${suggestion.title} » créé${insightMessage}. Cliquez dessus pour voir les foundation insights.`,
        });
      } catch (error) {
        setAiBuilderFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "Impossible de créer le challenge proposé.",
        });
      } finally {
        setApplyingNewChallengeIndices(current => {
          const next = new Set(current);
          next.delete(index);
          return next;
        });
      }
    },
    [boardData, challengeById, loadJourneyData, resolveOwnerId],
  );

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


  useEffect(() => {
    if (!boardData) {
      setActiveChallengeId(null);
      return;
    }

    if (activeChallengeId && allChallenges.some(challenge => challenge.id === activeChallengeId)) {
      return;
    }

    setActiveChallengeId(boardData.challenges[0]?.id ?? null);
  }, [boardData, activeChallengeId, allChallenges]);

  const challengeParentMap = useMemo(
    () => (boardData ? buildChallengeParentMap(boardData.challenges) : new Map<string, string | null>()),
    [boardData],
  );

  const challengeDescendantsMap = useMemo(
    () => (boardData ? buildChallengeDescendantsMap(boardData.challenges) : new Map<string, Set<string>>()),
    [boardData],
  );

  const invalidParentIds = useMemo(() => {
    if (!isEditingChallenge || !editingChallengeId) {
      return new Set<string>();
    }

    const ids = new Set<string>([editingChallengeId]);
    const descendants = challengeDescendantsMap.get(editingChallengeId);
    descendants?.forEach(id => ids.add(id));
    return ids;
  }, [isEditingChallenge, editingChallengeId, challengeDescendantsMap]);

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
    
    console.log('🔍 Frontend: Building insight map from asks:', {
      askCount: boardData.asks.length,
      asks: boardData.asks.map(ask => ({
        id: ask.id,
        title: ask.title,
        participantCount: ask.participants.length,
        participants: ask.participants.map(p => ({
          id: p.id,
          name: p.name,
          insightCount: p.insights.length,
          insights: p.insights.map(i => ({
            id: i.id,
            title: i.title.substring(0, 50),
            relatedChallengeIds: i.relatedChallengeIds,
          })),
        })),
      })),
    });
    
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
    
    console.log('🗺️ Frontend: Challenge insight map built:', {
      totalChallenges: map.size,
      challengesWithInsights: Array.from(map.entries()).map(([id, insights]) => ({
        challengeId: id,
        insightCount: insights.length,
      })),
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

  const activeChallengeInsights = useMemo(() => {
    if (!activeChallengeId) return [];
    
    const insights = challengeInsightMap.get(activeChallengeId) ?? [];
    
    console.log('🔍 Frontend: Active challenge insights:', {
      challengeId: activeChallengeId,
      insightCount: insights.length,
      insights: insights.map(i => ({ id: i.id, title: i.title })),
    });
    
    return insights;
  }, [challengeInsightMap, activeChallengeId]);

  const activeChallengeAsks = useMemo(
    () => (activeChallengeId ? asksByChallenge.get(activeChallengeId) ?? [] : []),
    [asksByChallenge, activeChallengeId],
  );

  useEffect(() => {
    if (activeChallengeId && rightColumnRef.current) {
      rightColumnRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeChallengeId]);

  const handleApplyAiAskSuggestion = useCallback(
    (suggestion: AiAskSuggestion) => {
      if (!boardData) {
        return;
      }

      const challengeId = activeChallengeId ?? allChallenges[0]?.id ?? "";
      if (!challengeId) {
        setAskAiFeedback({ type: "error", message: "Sélectionnez un challenge pour appliquer la suggestion IA." });
        return;
      }

      const trimmedQuestion = suggestion.question?.trim();
      if (!trimmedQuestion) {
        setAskAiFeedback({ type: "error", message: "La suggestion sélectionnée ne contient pas de question valide." });
        return;
      }

      const trimmedTitle = suggestion.title?.trim() || trimmedQuestion.slice(0, 80) || "ASK";
      const candidateKey = suggestion.askKey?.trim();
      const isValidAskKey = Boolean(candidateKey && /^[a-zA-Z0-9._-]{3,255}$/.test(candidateKey));
      const askKey = isValidAskKey ? (candidateKey as string) : generateAskKey(trimmedTitle || trimmedQuestion);

      const matchedParticipants: string[] = [];
      let spokespersonId = "";

      const availableUsers = boardData.availableUsers ?? [];

      if (suggestion.recommendedParticipants?.length) {
        suggestion.recommendedParticipants.forEach(participant => {
          const normalizedName = participant.name?.trim().toLowerCase();
          const matched = participant.id
            ? availableUsers.find(user => user.id === participant.id)
            : normalizedName
              ? availableUsers.find(user => user.name.toLowerCase() === normalizedName)
              : undefined;

          if (matched && !matchedParticipants.includes(matched.id)) {
            matchedParticipants.push(matched.id);
            if (participant.isSpokesperson) {
              spokespersonId = matched.id;
            }
          }
        });
      }

      const descriptionParts: string[] = [];
      const registerDescription = (value?: string | null) => {
        if (!value) {
          return;
        }
        const trimmed = value.trim();
        if (!trimmed) {
          return;
        }
        if (!descriptionParts.includes(trimmed)) {
          descriptionParts.push(trimmed);
        }
      };

      registerDescription(suggestion.summary);
      if (suggestion.objective && suggestion.objective !== suggestion.summary) {
        registerDescription(suggestion.objective);
      }
      registerDescription(suggestion.description);

      if (suggestion.followUpActions?.length) {
        const actions = suggestion.followUpActions.map(action => `- ${action}`).join("\n");
        registerDescription(`Actions recommandées :\n${actions}`);
      }

      if (suggestion.relatedInsights?.length) {
        const insightsSummary = suggestion.relatedInsights
          .map(reference => {
            const labelParts = [`Insight ${reference.insightId}`];
            if (reference.title) {
              labelParts.push(reference.title);
            }
            const base = labelParts.join(" – ");
            return reference.reason ? `${base} : ${reference.reason}` : base;
          })
          .join("\n");
        registerDescription(`Insights mobilisés :\n${insightsSummary}`);
      }

      const normaliseDateInput = (value?: string | null): string | null => {
        if (!value) {
          return null;
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return null;
        }
        return parsed.toISOString().slice(0, 16);
      };

      const baseForm = createEmptyAskForm(challengeId);
      const startDate = normaliseDateInput(suggestion.startDate) ?? baseForm.startDate;
      const endDate = normaliseDateInput(suggestion.endDate) ?? baseForm.endDate;
      const maxParticipants = suggestion.maxParticipants ? String(suggestion.maxParticipants) : baseForm.maxParticipants;

      setAskFormValues({
        ...baseForm,
        challengeId,
        askKey,
        name: trimmedTitle,
        question: trimmedQuestion,
        description: descriptionParts.length ? descriptionParts.join("\n\n") : baseForm.description,
        participantIds: matchedParticipants.length ? matchedParticipants : baseForm.participantIds,
        spokespersonId: spokespersonId || baseForm.spokespersonId,
        maxParticipants,
        isAnonymous:
          typeof suggestion.isAnonymous === "boolean" ? suggestion.isAnonymous : baseForm.isAnonymous,
        deliveryMode: suggestion.deliveryMode ?? baseForm.deliveryMode,
        audienceScope: suggestion.audienceScope ?? baseForm.audienceScope,
        responseMode: suggestion.responseMode ?? baseForm.responseMode,
        startDate,
        endDate,
      });

      setHasManualAskKey(isValidAskKey);
      setIsAskFormOpen(true);
      setIsEditingAsk(false);
      setEditingAskId(null);
      setAskFeedback(null);
      setAskAiFeedback({
        type: "success",
        message: "La suggestion IA a été appliquée au formulaire ASK. Vérifiez et complétez avant de sauvegarder.",
      });
    },
    [activeChallengeId, allChallenges, boardData],
  );

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
              <div className="flex items-stretch">
                <button type="button" className="flex-1 text-left" onClick={() => setActiveChallengeId(node.id)}>
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
                <div className={cn("flex shrink-0 items-start gap-1", isActive ? "p-4" : "p-3")}>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-slate-200 hover:bg-white/10 hover:text-white"
                    disabled={isSavingChallenge}
                    onClick={event => {
                      event.stopPropagation();
                      event.preventDefault();
                      handleChallengeEditStart(node.id);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit challenge {node.title}</span>
                  </Button>
                </div>
              </div>
              {node.children?.length ? (
                <CardContent className="border-t border-white/5 bg-slate-900/70">
                  {renderChallengeList(node.children, depth + 1)}
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>
    );
  };

  const renderAskInsights = (ask: ProjectAskOverview) => {
    const insightMap = new Map<string, AskInsightRow>();

    const registerInsight = (insight: ProjectParticipantInsight, fallback?: ProjectParticipantSummary) => {
      const fallbackContributors = fallback ? [fallback] : [];
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
    };

    ask.insights.forEach(insight => {
      registerInsight(insight);
    });

    ask.participants.forEach(participant => {
      const fallbackContributor: ProjectParticipantSummary = {
        id: participant.id,
        name: participant.name,
        role: participant.role,
      };
      participant.insights.forEach(insight => {
        registerInsight(insight, fallbackContributor);
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
      <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/70 p-6 text-center text-slate-200">
        <p>Unable to display project data.</p>
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <p className="text-sm text-slate-400">Please refresh the page or verify the project configuration.</p>
        )}
      </div>
    );
  }

  const availableUsers = boardData.availableUsers ?? [];
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
    setChallengeFormMode("create");
    setEditingChallengeId(null);
    setIsChallengeFormVisible(true);
    setChallengeFeedback(null);
    resetChallengeFormValues({
      parentId: parent?.id ?? "",
      impact: parent?.impact ?? "medium",
    });
  };

  const handleChallengeCancel = () => {
    setIsChallengeFormVisible(false);
    setChallengeFormMode("create");
    setEditingChallengeId(null);
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

  const handleChallengeEditStart = (challengeId: string) => {
    if (!boardData) {
      return;
    }

    const node = allChallenges.find(challenge => challenge.id === challengeId);
    if (!node) {
      return;
    }

    const statusValues = challengeStatusOptions.map(option => option.value);
    const normalizedStatus = statusValues.includes(node.status as ChallengeStatus)
      ? (node.status as ChallengeStatus)
      : "open";

    const ownerIds = (node.owners ?? [])
      .map(owner => owner.id)
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    const parentId = challengeParentMap.get(challengeId);

    setChallengeFormMode("edit");
    setEditingChallengeId(challengeId);
    setIsChallengeFormVisible(true);
    setChallengeFeedback(null);
    setIsSavingChallenge(false);
    setChallengeFormValues({
      title: node.title,
      description: node.description ?? "",
      status: normalizedStatus,
      impact: node.impact,
      ownerIds,
      parentId: parentId ?? "",
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
    const owners = availableUsers
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

    if (isEditingChallenge && editingChallengeId) {
      const invalidParentIds = new Set<string>([editingChallengeId]);
      const descendants = challengeDescendantsMap.get(editingChallengeId);
      descendants?.forEach(id => invalidParentIds.add(id));

      if (normalizedParentId && invalidParentIds.has(normalizedParentId)) {
        setChallengeFeedback({
          type: "error",
          message: "A challenge cannot be nested under one of its own sub-challenges.",
        });
        return;
      }
    }

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
        if (isEditingChallenge && editingChallengeId) {
          setBoardData(current => {
            if (!current) {
              return current;
            }

            const [remaining, extracted] = removeChallengeNode(current.challenges, editingChallengeId);
            if (!extracted) {
              return current;
            }

            const updatedChallenge: ProjectChallengeNode = {
              ...extracted,
              title: trimmedTitle,
              description: trimmedDescription,
              status: normalizedStatus,
              impact: challengeFormValues.impact,
              owners,
            };

            const nextChallenges = insertChallengeNode(remaining, updatedChallenge, resolvedParentId || null);

            return {
              ...current,
              challenges: nextChallenges,
            };
          });
          setActiveChallengeId(editingChallengeId);
          setChallengeFeedback({ type: "success", message: "Challenge updated successfully." });
        } else {
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
          setChallengeFeedback({
            type: "success",
            message: parentChallenge
              ? `Sub-challenge added under "${parentChallenge.title}".`
              : "Challenge added to the journey.",
          });
        }

        setIsChallengeFormVisible(false);
        setChallengeFormMode("create");
        setEditingChallengeId(null);
        resetChallengeFormValues();
        return;
      }

      if (isEditingChallenge && editingChallengeId) {
        const payload = {
          name: trimmedTitle,
          description: trimmedDescription,
          status: normalizedStatus,
          priority: challengeFormValues.impact,
          assignedTo: owners[0]?.id ?? "",
          parentChallengeId: resolvedParentId,
        };

        console.log('🔧 Frontend: Updating challenge with payload:', payload);

        const response = await fetch(`/api/admin/challenges/${editingChallengeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log('📡 Frontend: API response:', { status: response.status, result });
        
        if (!response.ok || !result.success) {
          throw new Error(result.error || "Unable to update challenge.");
        }

        console.log('✅ Frontend: Challenge updated, reloading data...');
        await loadJourneyData({ silent: true });
        setActiveChallengeId(editingChallengeId);
        setChallengeFeedback({ type: "success", message: "Challenge updated successfully." });
      } else {
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
        setChallengeFeedback({
          type: "success",
          message: parentChallenge
            ? `Sub-challenge created under "${parentChallenge.title}".`
            : "Challenge created successfully.",
        });
      }

      setIsChallengeFormVisible(false);
      setChallengeFormMode("create");
      setEditingChallengeId(null);
      resetChallengeFormValues();
    } catch (error) {
      console.error(isEditingChallenge ? "Failed to update challenge" : "Failed to create challenge", error);
      setChallengeFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : isEditingChallenge
              ? "Unable to update challenge."
              : "Unable to create challenge.",
      });
    } finally {
      setIsSavingChallenge(false);
    }
  };

  const getDefaultChallengeId = () => activeChallengeId ?? allChallenges[0]?.id ?? "";

  const handleAskCreateStart = () => {
    const defaultChallengeId = getDefaultChallengeId();
    setAskFormValues(createEmptyAskForm(defaultChallengeId));
    setHasManualAskKey(false);
    setIsAskFormOpen(true);
    setIsEditingAsk(false);
    setEditingAskId(null);
    setAskFeedback(null);
    setIsLoadingAskDetails(false);
  };

  const handleAskCancel = () => {
    setIsAskFormOpen(false);
    setIsEditingAsk(false);
    setEditingAskId(null);
    setAskFeedback(null);
    setIsSavingAsk(false);
    setHasManualAskKey(false);
    setAskFormValues(createEmptyAskForm(getDefaultChallengeId()));
  };

  const handleAskNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setAskFormValues(current => {
      const next: AskFormState = { ...current, name: value };
      if (!isEditingAsk && !hasManualAskKey) {
        next.askKey = generateAskKey(value || "ask");
      }
      return next;
    });
  };

  const handleAskKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, askKey: value }));
    setHasManualAskKey(true);
  };

  const handleAskKeyRegenerate = () => {
    if (isEditingAsk) {
      return;
    }
    const base = askFormValues.name || "ask";
    const nextKey = generateAskKey(base);
    setAskFormValues(current => ({ ...current, askKey: nextKey }));
    setHasManualAskKey(false);
  };

  const handleAskQuestionChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, question: value }));
  };

  const handleAskDescriptionChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, description: value }));
  };

  const handleAskStartChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, startDate: value }));
  };

  const handleAskEndChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, endDate: value }));
  };

  const handleAskStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, status: value as AskFormState["status"] }));
  };

  const handleAskDeliveryModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, deliveryMode: value as AskDeliveryMode }));
  };

  const handleAskAudienceScopeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, audienceScope: value as AskAudienceScope }));
  };

  const handleAskResponseModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, responseMode: value as AskGroupResponseMode }));
  };

  const handleAskChallengeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, challengeId: value }));
  };

  const handleAskMaxParticipantsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    if (value === "" || /^[0-9]+$/.test(value)) {
      setAskFormValues(current => ({ ...current, maxParticipants: value }));
    }
  };

  const handleAskAnonymousToggle = (event: ChangeEvent<HTMLInputElement>) => {
    setAskFormValues(current => ({ ...current, isAnonymous: event.target.checked }));
  };

  const handleAskParticipantToggle = (userId: string) => {
    setAskFormValues(current => {
      const hasParticipant = current.participantIds.includes(userId);
      const participantIds = hasParticipant
        ? current.participantIds.filter(id => id !== userId)
        : [...current.participantIds, userId];
      const spokespersonId = participantIds.includes(current.spokespersonId)
        ? current.spokespersonId
        : "";
      return {
        ...current,
        participantIds,
        spokespersonId,
      };
    });
  };

  const handleAskSpokespersonChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setAskFormValues(current => ({ ...current, spokespersonId: value }));
  };

  const handleAskFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!boardData) {
      return;
    }

    const challengeId = askFormValues.challengeId;
    const trimmedName = askFormValues.name.trim();
    const trimmedQuestion = askFormValues.question.trim();
    const trimmedDescription = askFormValues.description.trim();
    const startDate = askFormValues.startDate;
    const endDate = askFormValues.endDate;
    const maxParticipantsValue = askFormValues.maxParticipants.trim();
    const numericMaxParticipants = maxParticipantsValue ? Number(maxParticipantsValue) : undefined;

    if (!challengeId) {
      setAskFeedback({ type: "error", message: "Select a challenge to attach this ASK to." });
      return;
    }
    if (!trimmedName) {
      setAskFeedback({ type: "error", message: "Provide a name for this ASK." });
      return;
    }
    if (trimmedQuestion.length < 5) {
      setAskFeedback({ type: "error", message: "The question is too short." });
      return;
    }
    if (!startDate) {
      setAskFeedback({ type: "error", message: "Set a start date for the session." });
      return;
    }
    if (!endDate) {
      setAskFeedback({ type: "error", message: "Set an end date for the session." });
      return;
    }
    if (maxParticipantsValue && Number.isNaN(numericMaxParticipants)) {
      setAskFeedback({ type: "error", message: "Maximum participants must be a number." });
      return;
    }

    const participantIds = askFormValues.participantIds;
    const spokespersonId =
      askFormValues.spokespersonId && participantIds.includes(askFormValues.spokespersonId)
        ? askFormValues.spokespersonId
        : "";

    const basePayload = {
      name: trimmedName,
      question: trimmedQuestion,
      description: trimmedDescription,
      startDate,
      endDate,
      status: askFormValues.status,
      isAnonymous: askFormValues.isAnonymous,
      maxParticipants: numericMaxParticipants,
      deliveryMode: askFormValues.deliveryMode,
      audienceScope: askFormValues.audienceScope,
      responseMode: askFormValues.responseMode,
      participantIds,
      spokespersonId,
      challengeId,
    };

    setIsSavingAsk(true);
    setAskFeedback(null);

    try {
      if (isEditingAsk && editingAskId) {
        const response = await fetch(`/api/admin/asks/${editingAskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basePayload),
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to update ASK");
        }
        const record = payload.data as AskSessionRecord;
        setAskDetails(current => ({ ...current, [record.id]: record }));
        setAskFeedback({ type: "success", message: "ASK updated successfully." });
        await loadJourneyData({ silent: true });
        setIsAskFormOpen(false);
        setIsEditingAsk(false);
        setEditingAskId(null);
        setHasManualAskKey(false);
        setAskFormValues(createEmptyAskForm(getDefaultChallengeId()));
      } else {
        const askKey = (askFormValues.askKey || "").trim() || generateAskKey(trimmedName || "ask");
        const payload = { ...basePayload, askKey, projectId: boardData.projectId };
        
        console.log('🔧 Frontend: Creating ASK with payload:', payload);

        const response = await fetch("/api/admin/asks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        
        const result = await response.json();
        console.log('📡 Frontend: ASK creation response:', { status: response.status, result });
        
        if (!response.ok || !result.success) {
          throw new Error(result.error || "Unable to create ASK");
        }
        
        const record = result.data as AskSessionRecord;
        console.log('✅ Frontend: ASK created successfully:', record);
        
        setAskDetails(current => ({ ...current, [record.id]: record }));
        setAskFeedback({ type: "success", message: "ASK created successfully." });
        setAskFormValues(current => ({ ...createEmptyAskForm(challengeId), challengeId }));
        setHasManualAskKey(false);
        
        console.log('✅ Frontend: ASK created, reloading data...');
        await loadJourneyData({ silent: true });
      }
    } catch (error) {
      console.error("Failed to save ASK", error);
      setAskFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to save ASK" });
    } finally {
      setIsSavingAsk(false);
    }
  };

  const handleAskEditStart = async (askId: string) => {
    setIsAskFormOpen(true);
    setIsEditingAsk(true);
    setEditingAskId(askId);
    setHasManualAskKey(true);
    setAskFeedback(null);
    setIsLoadingAskDetails(true);

    try {
      const record = await ensureAskDetails(askId);
      const participants = record.participants?.map(participant => participant.id) ?? [];
      const spokesperson = record.participants?.find(participant => participant.isSpokesperson)?.id ?? "";

      setAskFormValues({
        challengeId: record.challengeId ?? getDefaultChallengeId(),
        askKey: record.askKey,
        name: record.name ?? "",
        question: record.question ?? "",
        description: record.description ?? "",
        status: normalizeAskStatus(record.status),
        startDate: toInputDate(record.startDate),
        endDate: toInputDate(record.endDate),
        isAnonymous: Boolean(record.isAnonymous),
        maxParticipants: record.maxParticipants ? String(record.maxParticipants) : "",
        participantIds: participants,
        spokespersonId: spokesperson && participants.includes(spokesperson) ? spokesperson : "",
        deliveryMode: record.deliveryMode ?? "digital",
        audienceScope: record.audienceScope ?? (participants.length > 1 ? "group" : "individual"),
        responseMode: record.responseMode ?? "collective",
      });
    } catch (error) {
      console.error("Failed to load ASK details", error);
      setAskFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to load ASK details.",
      });
      setIsAskFormOpen(false);
      setIsEditingAsk(false);
      setEditingAskId(null);
    } finally {
      setIsLoadingAskDetails(false);
    }
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

  const handleChallengeDelete = async () => {
    if (!editingChallengeId) {
      return;
    }

    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce challenge ? Cette action est irréversible.")) {
      return;
    }

    try {
      setIsSavingChallenge(true);
      setFeedback(null);
      
      const response = await fetch(`/api/admin/challenges/${editingChallengeId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Impossible de supprimer le challenge");
      }

      // Recharger les données du projet
      await loadJourneyData();
      
      setFeedback({ type: "success", message: "Challenge supprimé avec succès." });
      setIsChallengeFormVisible(false);
      setEditingChallengeId(null);
      setChallengeFormMode("create");
    } catch (err) {
      console.error("Erreur lors de la suppression du challenge", err);
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Impossible de supprimer le challenge.",
      });
    } finally {
      setIsSavingChallenge(false);
    }
  };

  const handleAskDelete = async () => {
    if (!editingAskId) {
      return;
    }

    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette session ASK ? Cette action est irréversible.")) {
      return;
    }

    try {
      setIsSavingAsk(true);
      setFeedback(null);
      
      const response = await fetch(`/api/admin/asks/${editingAskId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Impossible de supprimer la session ASK");
      }

      // Recharger les données du projet
      await loadJourneyData();
      
      setFeedback({ type: "success", message: "Session ASK supprimée avec succès." });
      setIsAskFormOpen(false);
      setEditingAskId(null);
      setIsEditingAsk(false);
    } catch (err) {
      console.error("Erreur lors de la suppression de la session ASK", err);
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Impossible de supprimer la session ASK.",
      });
    } finally {
      setIsSavingAsk(false);
    }
  };

  return (
    <>
      {boardData ? (
        <AiChallengeBuilderPanel
          open={isAiPanelOpen}
          onOpenChange={setIsAiPanelOpen}
          projectName={boardData.projectName}
          isRunning={isAiBuilderRunning}
          onRunAgain={handleLaunchAiChallengeBuilder}
          suggestions={aiSuggestions}
          newChallenges={aiNewChallenges}
          errors={aiBuilderErrors}
          challengeLookup={challengeById}
          onApplySuggestion={handleApplyChallengeSuggestion}
          onDismissSuggestion={handleDismissChallengeSuggestion}
          applyingChallengeIds={applyingChallengeIds}
          onApplyNewChallenge={handleApplyNewChallengeSuggestion}
          onDismissNewChallenge={handleDismissNewChallengeSuggestion}
          applyingNewChallengeIndices={applyingNewChallengeIndices}
        />
      ) : null}

      {boardData ? (
        <AiAskGeneratorPanel
          open={isAskAiPanelOpen}
          onOpenChange={setIsAskAiPanelOpen}
          challengeTitle={activeChallenge?.title ?? "Current challenge"}
          isRunning={isAskAiRunning}
          onRunAgain={handleLaunchAskAiGenerator}
          suggestions={askAiSuggestions}
          feedback={askAiFeedback}
          errors={askAiErrors}
          onApplySuggestion={(suggestion, index) => {
            handleApplyAiAskSuggestion(suggestion);
            handleDismissAskSuggestion(index);
          }}
          onDismissSuggestion={handleDismissAskSuggestion}
        />
      ) : null}

      <div className="space-y-8 text-slate-100">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Live data unavailable</AlertTitle>
          <AlertDescription>
            {error}.
            {USE_MOCK_JOURNEY
              ? " Showing mock data so you can continue designing the experience."
              : " Please refresh or verify the project configuration."}
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
              <Button
                onClick={handleEditToggle}
                className="gap-2 btn-gradient bg-primary hover:bg-primary/90 h-10 px-4 py-2"
              >
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
                  onClick={handleLaunchAiChallengeBuilder}
                  disabled={isAiBuilderRunning}
                >
                  {isAiBuilderRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isAiBuilderRunning ? "Analyzing with AI" : "Launch AI challenge builder"}
                </Button>
                <Button
                  type="button"
                  className="gap-2 btn-gradient bg-primary hover:bg-primary/90 h-10 px-4 py-2"
                  onClick={() => handleChallengeStart()}
                  disabled={isSavingChallenge}
                >
                  <Plus className="h-4 w-4" />
                  New challenge
                </Button>
              </div>
            </div>
            {aiBuilderFeedback ? (
              <Alert
                variant={aiBuilderFeedback.type === "success" ? "default" : "destructive"}
                className={cn(
                  aiBuilderFeedback.type === "success" &&
                    "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 backdrop-blur-sm"
                )}
              >
                <AlertDescription
                  className={cn(aiBuilderFeedback.type === "success" && "text-emerald-50/80")}
                >
                  {aiBuilderFeedback.message}
                </AlertDescription>
              </Alert>
            ) : null}

            {challengeFeedback ? (
              <Alert
                variant={challengeFeedback.type === "success" ? "default" : "destructive"}
                className={cn(
                  challengeFeedback.type === "success" &&
                    "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 backdrop-blur-sm"
                )}
              >
                <AlertDescription
                  className={cn(challengeFeedback.type === "success" && "text-emerald-50/80")}
                >
                  {challengeFeedback.message}
                </AlertDescription>
              </Alert>
            ) : null}

            {boardData.challenges?.length ? (
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
                <Card className="border border-emerald-400/40 bg-emerald-500/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-white">
                      Foundational insights
                    </CardTitle>
                    <p className="text-sm text-slate-300">
                      These insights contributed to framing the challenge "{activeChallenge.title}".
                    </p>
                  </CardHeader>
                  <CardContent>
                    {activeChallengeInsights?.length ? (
                      <div className="space-y-3">
                        {activeChallengeInsights.map(insight => (
                          <div
                            key={`${insight.id}-${insight.askId}`}
                            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-4"
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
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-indigo-500 text-white hover:bg-indigo-400"
                      onClick={() => {
                        if (isAskFormOpen) {
                          handleAskCancel();
                        } else {
                          handleAskCreateStart();
                        }
                      }}
                      disabled={isSavingAsk || isLoadingAskDetails}
                    >
                      {isAskFormOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {isAskFormOpen ? "Close form" : "Create ASK"}
                    </Button>
                    <Button
                      size="sm"
                      variant="glassDark"
                      className="gap-2"
                      onClick={handleLaunchAskAiGenerator}
                      disabled={isAskAiRunning || !activeChallenge}
                    >
                      {isAskAiRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {isAskAiRunning ? "Generating ASKs" : "Generate ASKs with AI"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-4">
                  {activeChallengeAsks?.length ? (
                    activeChallengeAsks.map(ask => (
                      <Card key={ask.id} className="border border-white/10 bg-slate-900/70 shadow-sm">
                        <CardHeader className="space-y-3 pb-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <CardTitle className="text-base font-semibold text-white">{ask.title}</CardTitle>
                              <p className="mt-1 text-sm text-slate-300">{ask.summary}</p>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="flex flex-col items-end gap-1 text-xs text-slate-400">
                                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 font-medium text-slate-100">
                                  <Calendar className="h-3.5 w-3.5 text-slate-200" /> Due {formatDate(ask.dueDate)}
                                </span>
                                <span className="text-slate-300">Status: {ask.status}</span>
                              </div>
                              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
                                <Button
                                  asChild
                                  size="sm"
                                  className="gap-1 bg-emerald-500 text-white hover:bg-emerald-400"
                                >
                                  <Link href={`/?key=${encodeURIComponent(ask.askKey)}`} target="_blank" rel="noopener noreferrer">
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    Answer ASK
                                  </Link>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="glassDark"
                                  className="gap-1"
                                  onClick={() => {
                                    void handleAskEditStart(ask.id);
                                  }}
                                  disabled={isSavingAsk || isLoadingAskDetails}
                                >
                                  {isLoadingAskDetails && editingAskId === ask.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Pencil className="h-3.5 w-3.5" />
                                  )}
                                  Edit
                                </Button>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-slate-200">
                              <Target className="h-3.5 w-3.5 text-indigo-300" /> General theme
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-slate-200">
                              <Users className="h-3.5 w-3.5 text-slate-200" /> {ask.participants?.length} participant{ask.participants?.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span className="font-semibold text-slate-300">Related projects:</span>
                            {ask.relatedProjects?.length ? (
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

      <Dialog.Root
        open={isChallengeFormVisible}
        onOpenChange={open => {
          if (open) {
            setIsChallengeFormVisible(true);
          } else {
            handleChallengeCancel();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <Card className="relative w-full max-w-3xl border border-indigo-300/40 bg-slate-900/80 shadow-xl my-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={handleChallengeCancel}
                  className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 p-1 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
                  aria-label="Close challenge form"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
              <CardHeader className="pr-10">
                <Dialog.Title asChild>
                  <CardTitle>{isEditingChallenge ? "Edit challenge" : "Create a new challenge"}</CardTitle>
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-300">
                  {isEditingChallenge
                    ? "Update the challenge status, impact or context without leaving the admin board."
                    : "Provide a clear title, status and description so collaborators can respond effectively."}
                </Dialog.Description>
              </CardHeader>
              <CardContent className="space-y-4">
                {challengeFeedback?.type === "error" ? (
                  <Alert variant="destructive">
                    <AlertTitle>Something went wrong</AlertTitle>
                    <AlertDescription>{challengeFeedback.message}</AlertDescription>
                  </Alert>
                ) : null}
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
                        {parentChallengeOptions
                          .filter(option => !invalidParentIds.has(option.id))
                          .map(option => (
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
                {availableUsers.length ? (
                  <div className="flex flex-col gap-2">
                    <Label>Owners</Label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {availableUsers.map(user => {
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
                    className="gap-2"
                    onClick={handleChallengeSave}
                    disabled={isSavingChallenge || !challengeFormValues.title.trim()}
                  >
                    {isSavingChallenge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSavingChallenge ? "Saving" : isEditingChallenge ? "Update challenge" : "Save challenge"}
                  </Button>
                  {isEditingChallenge && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleChallengeDelete}
                      disabled={isSavingChallenge}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="glassDark"
                    onClick={handleChallengeCancel}
                    disabled={isSavingChallenge}
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

      <Dialog.Root
        open={isAskFormOpen}
        onOpenChange={open => {
          if (open) {
            setIsAskFormOpen(true);
          } else {
            handleAskCancel();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <Card className="relative w-full max-w-5xl border border-indigo-400/40 bg-slate-950/80 shadow-xl my-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={handleAskCancel}
                  className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 p-1 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
                  aria-label="Close ASK form"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
              <CardHeader className="pr-10">
                <Dialog.Title asChild>
                  <CardTitle>{isEditingAsk ? "Edit ASK session" : "Create ASK session"}</CardTitle>
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-300">
                  {isEditingAsk
                    ? "Adjust the ASK details, participants and schedule without leaving the journey board."
                    : "Define the ASK session so collaborators know how to facilitate it and capture insights."}
                </Dialog.Description>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleAskFormSubmit} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-white">
                      {isEditingAsk ? "Edit ASK session" : "Create ASK session"}
                    </h3>
                    {isEditingAsk ? (
                      <span className="text-xs font-medium text-indigo-200">Editing current session</span>
                    ) : null}
                  </div>

                  {askFeedback ? (
                    <Alert
                      className={cn(
                        "border px-3 py-3",
                        askFeedback.type === "error"
                          ? "border-destructive/40 bg-destructive/10 text-destructive-foreground"
                          : "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
                      )}
                    >
                      <AlertTitle className="text-sm font-semibold">
                        {askFeedback.type === "error" ? "Something went wrong" : "Success"}
                      </AlertTitle>
                      <AlertDescription className="text-sm">{askFeedback.message}</AlertDescription>
                    </Alert>
                  ) : null}

                  {isLoadingAskDetails ? (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />
                      Loading ASK details…
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-challenge">Challenge</Label>
                      <select
                        id="ask-challenge"
                        value={askFormValues.challengeId}
                        onChange={handleAskChallengeChange}
                        className="h-10 rounded-md border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                        disabled={isSavingAsk || isLoadingAskDetails}
                      >
                        <option value="">Select a challenge</option>
                        {allChallenges.map(challenge => (
                          <option key={challenge.id} value={challenge.id}>
                            {challenge.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-key">ASK key</Label>
                      <div className="flex gap-2">
                        <Input
                          id="ask-key"
                          value={askFormValues.askKey}
                          onChange={handleAskKeyChange}
                          placeholder="session-team-001"
                          disabled={isSavingAsk || isLoadingAskDetails || isEditingAsk}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                          onClick={handleAskKeyRegenerate}
                          disabled={isSavingAsk || isLoadingAskDetails || isEditingAsk}
                        >
                          Refresh
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-name">Name</Label>
                      <Input
                        id="ask-name"
                        value={askFormValues.name}
                        onChange={handleAskNameChange}
                        placeholder="Session name"
                        disabled={isSavingAsk || isLoadingAskDetails}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-status">Status</Label>
                      <select
                        id="ask-status"
                        value={askFormValues.status}
                        onChange={handleAskStatusChange}
                        className="h-10 rounded-md border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                        disabled={isSavingAsk || isLoadingAskDetails}
                      >
                        {askStatusOptions.map(status => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ask-question">Question</Label>
                    <Textarea
                      id="ask-question"
                      rows={3}
                      value={askFormValues.question}
                      onChange={handleAskQuestionChange}
                      placeholder="What do you want participants to reflect on?"
                      disabled={isSavingAsk || isLoadingAskDetails}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ask-description">Description</Label>
                    <Textarea
                      id="ask-description"
                      rows={2}
                      value={askFormValues.description}
                      onChange={handleAskDescriptionChange}
                      placeholder="Share additional context"
                      disabled={isSavingAsk || isLoadingAskDetails}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-start">Start</Label>
                      <Input
                        id="ask-start"
                        type="datetime-local"
                        value={askFormValues.startDate}
                        onChange={handleAskStartChange}
                        disabled={isSavingAsk || isLoadingAskDetails}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-end">End</Label>
                      <Input
                        id="ask-end"
                        type="datetime-local"
                        value={askFormValues.endDate}
                        onChange={handleAskEndChange}
                        disabled={isSavingAsk || isLoadingAskDetails}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-delivery">Delivery mode</Label>
                      <select
                        id="ask-delivery"
                        value={askFormValues.deliveryMode}
                        onChange={handleAskDeliveryModeChange}
                        className="h-10 rounded-md border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                        disabled={isSavingAsk || isLoadingAskDetails}
                      >
                        {askDeliveryModes.map(mode => (
                          <option key={mode} value={mode}>
                            {mode === "physical" ? "In-person" : "Digital"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-audience">Audience</Label>
                      <select
                        id="ask-audience"
                        value={askFormValues.audienceScope}
                        onChange={handleAskAudienceScopeChange}
                        className="h-10 rounded-md border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                        disabled={isSavingAsk || isLoadingAskDetails}
                      >
                        {askAudienceScopes.map(scope => (
                          <option key={scope} value={scope}>
                            {scope === "individual" ? "Individual" : "Group"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-response">Response mode</Label>
                      <select
                        id="ask-response"
                        value={askFormValues.responseMode}
                        onChange={handleAskResponseModeChange}
                        className="h-10 rounded-md border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                        disabled={isSavingAsk || isLoadingAskDetails}
                      >
                        {askResponseModes.map(mode => (
                          <option key={mode} value={mode}>
                            {mode === "collective" ? "Collective" : "Simultaneous"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-max-participants">Maximum participants</Label>
                      <Input
                        id="ask-max-participants"
                        value={askFormValues.maxParticipants}
                        onChange={handleAskMaxParticipantsChange}
                        placeholder="Optional limit"
                        disabled={isSavingAsk || isLoadingAskDetails}
                      />
                    </div>
                    <label className="flex items-center gap-2 self-end text-sm text-slate-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/20 bg-slate-900"
                        checked={askFormValues.isAnonymous}
                        onChange={handleAskAnonymousToggle}
                        disabled={isSavingAsk || isLoadingAskDetails}
                      />
                      Allow anonymous participation
                    </label>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Participants</Label>
                    {availableUsers.length ? (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {availableUsers.map(user => {
                          const isSelected = askFormValues.participantIds.includes(user.id);
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
                                className="h-4 w-4 rounded border-white/30 bg-slate-900 text-indigo-500 focus:ring-indigo-400"
                                checked={isSelected}
                                onChange={() => handleAskParticipantToggle(user.id)}
                                disabled={isSavingAsk || isLoadingAskDetails}
                              />
                              <span className="flex flex-col leading-tight">
                                <span className="font-medium text-white">{user.name}</span>
                                {user.role ? <span className="text-xs text-slate-400">{user.role}</span> : null}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">No collaborators are available for this project yet.</p>
                    )}
                  </div>

                  {askFormValues.participantIds?.length ? (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ask-spokesperson">Spokesperson</Label>
                      <select
                        id="ask-spokesperson"
                        value={askFormValues.spokespersonId}
                        onChange={handleAskSpokespersonChange}
                        className="h-10 rounded-md border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20"
                        disabled={isSavingAsk || isLoadingAskDetails}
                      >
                        <option value="">No spokesperson</option>
                        {askFormValues.participantIds
                          .map(participantId => availableUsers.find(user => user.id === participantId))
                          .filter((user): user is NonNullable<typeof user> => Boolean(user))
                          .map(user => (
                            <option key={user.id} value={user.id}>
                              {user.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="submit"
                      className="gap-2"
                      disabled={isSavingAsk || isLoadingAskDetails}
                    >
                      {isSavingAsk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {isEditingAsk ? "Update ASK" : "Save ASK"}
                    </Button>
                    {isEditingAsk && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleAskDelete}
                        disabled={isSavingAsk}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="glassDark"
                      onClick={handleAskCancel}
                      disabled={isSavingAsk}
                      className="gap-2"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      </div>
    </>
  );
}
