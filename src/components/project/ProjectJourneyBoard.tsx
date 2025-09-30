"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Lightbulb,
  Link2,
  Sparkles,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getMockProjectJourneyData } from "@/lib/mockProjectJourney";
import {
  InsightCategory,
  ProjectAskOverview,
  ProjectChallengeNode,
  ProjectJourneyBoardData,
  ProjectParticipantInsight,
} from "@/types";

const insightTypeConfig: Record<InsightCategory, { label: string; icon: LucideIcon; badgeClass: string }> = {
  pain: {
    label: "Pain",
    icon: AlertTriangle,
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
  },
  gain: {
    label: "Gain",
    icon: Sparkles,
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  signal: {
    label: "Signal",
    icon: Activity,
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
  },
  idea: {
    label: "Idea",
    icon: Lightbulb,
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

const impactBadgeClass: Record<ProjectChallengeNode["impact"], string> = {
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-indigo-50 text-indigo-700",
  critical: "bg-rose-50 text-rose-700",
};

function flattenChallenges(nodes: ProjectChallengeNode[]): ProjectChallengeNode[] {
  const result: ProjectChallengeNode[] = [];
  nodes.forEach(node => {
    result.push(node);
    if (node.children?.length) {
      result.push(...flattenChallenges(node.children));
    }
  });
  return result;
}

function findChallengeNode(nodes: ProjectChallengeNode[], id: string): ProjectChallengeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children?.length) {
      const child = findChallengeNode(node.children, id);
      if (child) {
        return child;
      }
    }
  }
  return null;
}

function findChallengePath(nodes: ProjectChallengeNode[], id: string, trail: string[] = []): string[] | null {
  for (const node of nodes) {
    const nextTrail = [...trail, node.id];
    if (node.id === id) {
      return nextTrail;
    }
    if (node.children?.length) {
      const childTrail = findChallengePath(node.children, id, nextTrail);
      if (childTrail) {
        return childTrail;
      }
    }
  }
  return null;
}

function groupInsightsByType(insights: ProjectParticipantInsight[]): Record<InsightCategory, ProjectParticipantInsight[]> {
  return insights.reduce((acc, insight) => {
    if (!acc[insight.type]) {
      acc[insight.type] = [];
    }
    acc[insight.type]!.push(insight);
    return acc;
  }, {} as Record<InsightCategory, ProjectParticipantInsight[]>);
}

function formatKpiValue(kpi: ProjectParticipantInsight["kpis"][number]): string {
  const parts: string[] = [];
  if (kpi.current) {
    parts.push(`Actuel ${kpi.current}`);
  }
  if (kpi.target) {
    parts.push(`Cible ${kpi.target}`);
  }
  if (kpi.delta) {
    parts.push(`Δ ${kpi.delta}`);
  }
  if (kpi.unit) {
    parts.push(kpi.unit);
  }
  return parts.join(" · ") || (kpi.comment ?? "");
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date);
}

interface ProjectJourneyBoardProps {
  projectId: string;
}

export function ProjectJourneyBoard({ projectId }: ProjectJourneyBoardProps) {
  const [boardData, setBoardData] = useState<ProjectJourneyBoardData>(() => getMockProjectJourneyData(projectId));
  const [selectedAskId, setSelectedAskId] = useState<string | null>(boardData.asks[0]?.id ?? null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [focusedChallengeAskId, setFocusedChallengeAskId] = useState<string | null>(null);
  const [pendingUserInputs, setPendingUserInputs] = useState<Record<string, string>>({});
  const [pendingUserErrors, setPendingUserErrors] = useState<Record<string, string | null>>({});
  const [hoveredInsightId, setHoveredInsightId] = useState<string | null>(null);
  const [hoveredChallengeId, setHoveredChallengeId] = useState<string | null>(null);
  const [expandedChallenges, setExpandedChallenges] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    const populate = (nodes: ProjectChallengeNode[]) => {
      nodes.forEach(node => {
        initial[node.id] = true;
        if (node.children?.length) {
          populate(node.children);
        }
      });
    };
    populate(boardData.challenges);
    return initial;
  });

  const flattenedChallenges = useMemo(() => flattenChallenges(boardData.challenges), [boardData.challenges]);

  const challengeMap = useMemo(() => {
    const map = new Map<string, ProjectChallengeNode>();
    flattenedChallenges.forEach(challenge => {
      map.set(challenge.id, challenge);
    });
    return map;
  }, [flattenedChallenges]);

  const askMap = useMemo(() => {
    const map = new Map<string, ProjectAskOverview>();
    boardData.asks.forEach(ask => {
      map.set(ask.id, ask);
    });
    return map;
  }, [boardData.asks]);

  const challengeConnections = useMemo(() => {
    const base = new Map<string, { askIds: Set<string>; insightIds: Set<string> }>();
    boardData.asks.forEach(ask => {
      ask.participants.forEach(participant => {
        participant.insights.forEach(insight => {
          insight.relatedChallengeIds.forEach(challengeId => {
            if (!base.has(challengeId)) {
              base.set(challengeId, { askIds: new Set(), insightIds: new Set() });
            }
            const entry = base.get(challengeId)!;
            entry.askIds.add(ask.id);
            entry.insightIds.add(insight.id);
          });
        });
      });
    });
    return base;
  }, [boardData.asks]);

  const aggregatedConnections = useMemo(() => {
    const result = new Map<string, { askIds: Set<string>; insightIds: Set<string> }>();
    const build = (node: ProjectChallengeNode): { askIds: Set<string>; insightIds: Set<string> } => {
      const own = challengeConnections.get(node.id);
      const askIds = new Set<string>(own ? Array.from(own.askIds) : []);
      const insightIds = new Set<string>(own ? Array.from(own.insightIds) : []);

      node.children?.forEach(child => {
        const childConnections = build(child);
        childConnections.askIds.forEach(id => askIds.add(id));
        childConnections.insightIds.forEach(id => insightIds.add(id));
      });

      const combined = { askIds, insightIds };
      result.set(node.id, combined);
      return combined;
    };

    boardData.challenges.forEach(build);
    return result;
  }, [boardData.challenges, challengeConnections]);

  const totalInsights = useMemo(
    () =>
      boardData.asks.reduce(
        (count, ask) =>
          count +
          ask.participants.reduce((participantCount, participant) => participantCount + participant.insights.length, 0),
        0,
      ),
    [boardData.asks],
  );

  const totalChallenges = flattenedChallenges.length;
  const activeAskCount = boardData.asks.filter(ask => ask.status === "active").length;

  const selectedAsk = selectedAskId ? askMap.get(selectedAskId) ?? null : null;
  const selectedChallenge = selectedChallengeId
    ? findChallengeNode(boardData.challenges, selectedChallengeId)
    : null;
  const focusedAsk = focusedChallengeAskId ? askMap.get(focusedChallengeAskId) ?? null : null;

  const breadcrumbSlots = [
    {
      kind: "ask" as const,
      item: selectedAsk,
      placeholder: "Sélectionner un ASK",
    },
    {
      kind: "challenge" as const,
      item: selectedChallenge,
      placeholder: "Sélectionner un challenge",
    },
    {
      kind: "ask" as const,
      item: focusedAsk,
      placeholder: selectedChallenge ? "Choisir un ASK lié" : "ASK lié",
    },
  ];

  const ensureChallengeOpen = (challengeId: string) => {
    const path = findChallengePath(boardData.challenges, challengeId);
    if (!path) {
      return;
    }
    setExpandedChallenges(prev => {
      const next = { ...prev };
      path.forEach(id => {
        next[id] = true;
      });
      return next;
    });
  };

  const handleSelectChallenge = (challengeId: string) => {
    ensureChallengeOpen(challengeId);
    setSelectedChallengeId(challengeId);
    setFocusedChallengeAskId(null);
  };

  const handleSelectAsk = (askId: string) => {
    setSelectedAskId(askId);
    setFocusedChallengeAskId(null);
  };

  const handleFocusAskFromChallenge = (askId: string) => {
    setFocusedChallengeAskId(askId);
    if (!selectedAskId) {
      setSelectedAskId(askId);
    }
  };

  const handleOpenChallengeFromInsight = (challengeId: string) => {
    ensureChallengeOpen(challengeId);
    setSelectedChallengeId(challengeId);
  };

  const handleToggleChallenge = (challengeId: string) => {
    setExpandedChallenges(prev => ({
      ...prev,
      [challengeId]: !prev[challengeId],
    }));
  };

  const handleAddParticipant = (askId: string) => {
    const value = (pendingUserInputs[askId] ?? "").trim();
    if (!value) {
      setPendingUserErrors(prev => ({ ...prev, [askId]: "Choisissez un participant" }));
      return;
    }

    const option = boardData.availableUsers.find(
      user => user.name.toLowerCase() === value.toLowerCase(),
    );

    if (!option) {
      setPendingUserErrors(prev => ({ ...prev, [askId]: "Ce participant n'est pas référencé" }));
      return;
    }

    setBoardData(prev => ({
      ...prev,
      asks: prev.asks.map(ask => {
        if (ask.id !== askId) {
          return ask;
        }
        if (ask.participants.some(participant => participant.id === option.id)) {
          return ask;
        }
        return {
          ...ask,
          participants: [
            ...ask.participants,
            {
              id: option.id,
              name: option.name,
              role: option.role,
              avatarInitials: option.avatarInitials,
              avatarColor: option.avatarColor,
              insights: [],
            },
          ],
        };
      }),
    }));

    setPendingUserInputs(prev => ({ ...prev, [askId]: "" }));
    setPendingUserErrors(prev => ({ ...prev, [askId]: null }));
  };

  const renderChallengeNode = (node: ProjectChallengeNode, depth = 0) => {
    const aggregated = aggregatedConnections.get(node.id);
    const associatedAskIds = aggregated ? Array.from(aggregated.askIds) : [];
    const associatedAsks = associatedAskIds
      .map(askId => askMap.get(askId))
      .filter((ask): ask is ProjectAskOverview => Boolean(ask));
    const isExpanded = expandedChallenges[node.id] ?? true;
    const isSelected = selectedChallengeId === node.id;
    const isHovered = hoveredChallengeId === node.id;

    return (
      <div key={node.id} className={cn("space-y-3", depth > 0 && "pl-4 border-l border-slate-200/60")}
        onMouseEnter={() => setHoveredChallengeId(node.id)}
        onMouseLeave={() => setHoveredChallengeId(prev => (prev === node.id ? null : prev))}
      >
        <Card
          className={cn(
            "border border-slate-200/80 bg-white/70 shadow-sm transition",
            isSelected && "border-indigo-400 shadow-md",
            isHovered && !isSelected && "border-indigo-200",
          )}
        >
          <CardHeader className="space-y-3 pb-0">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="flex flex-1 items-start gap-3 text-left"
                onClick={() => handleSelectChallenge(node.id)}
              >
                <span
                  className={cn(
                    "mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-500",
                    node.children?.length ? "" : "opacity-80",
                  )}
                  onClick={event => {
                    event.stopPropagation();
                    handleToggleChallenge(node.id);
                  }}
                >
                  {node.children?.length ? (
                    isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                  ) : (
                    <Target className="h-4 w-4" />
                  )}
                </span>
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold text-slate-900">{node.title}</CardTitle>
                  <p className="text-sm text-slate-600">{node.description}</p>
                </div>
              </button>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" className="h-9 border-indigo-200 bg-indigo-50 text-indigo-700">
                  Générer des ASK
                </Button>
                <Button size="sm" className="h-9 bg-indigo-500 text-white hover:bg-indigo-500/90">
                  Créer un ASK
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-1 font-medium uppercase tracking-wide">{node.status}</span>
              <span className={cn("rounded-full px-2 py-1 font-medium uppercase tracking-wide", impactBadgeClass[node.impact])}>
                Impact {node.impact}
              </span>
              {node.owner && <span className="rounded-full bg-slate-100 px-2 py-1">Piloté par {node.owner}</span>}
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-sm">
                <Link2 className="h-3.5 w-3.5" />
                {aggregated ? aggregated.insightIds.size : 0} insights
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-sm">
                <Users className="h-3.5 w-3.5" />
                {associatedAsks.length} ASK
              </span>
            </div>
          </CardHeader>
          {isSelected && (
            <CardContent className="space-y-3 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                ASK reliés au challenge
              </p>
              <div className="grid gap-2">
                {associatedAsks.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun ASK n'est encore associé.</p>
                ) : (
                  associatedAsks.map(ask => (
                    <button
                      key={ask.id}
                      type="button"
                      className={cn(
                        "group rounded-xl border border-slate-200/80 bg-white/80 p-3 text-left transition hover:border-indigo-300 hover:shadow-sm",
                        focusedChallengeAskId === ask.id && "border-indigo-400 shadow",
                      )}
                      onClick={() => handleFocusAskFromChallenge(ask.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{ask.title}</p>
                          <p className="text-xs text-slate-500">{ask.summary}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:text-indigo-500" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          )}
        </Card>
        {node.children?.length && isExpanded ? (
          <div className="space-y-3">
            {node.children.map(child => renderChallengeNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <section className="border-b border-slate-200 bg-gradient-to-br from-indigo-50 via-white to-slate-100">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Projet</p>
              <h1 className="text-3xl font-bold text-slate-900">{boardData.projectName}</h1>
              <p className="max-w-2xl text-base text-slate-600">{boardData.projectGoal}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200">
              <dl className="grid grid-cols-3 gap-6 text-sm text-slate-600">
                <div>
                  <dt className="font-semibold text-slate-500">Client</dt>
                  <dd className="mt-1 text-base font-semibold text-slate-900">{boardData.clientName}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Période</dt>
                  <dd className="mt-1 text-base font-semibold text-slate-900">{boardData.timeframe}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">ASK actifs</dt>
                  <dd className="mt-1 text-base font-semibold text-slate-900">{activeAskCount}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>ASK totaux</span>
                <Sparkles className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{boardData.asks.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Insights capturés</span>
                <Link2 className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{totalInsights}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Challenges cartographiés</span>
                <GitBranch className="h-4 w-4 text-rose-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{totalChallenges}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            {breadcrumbSlots.map((slot, index) => {
              const item = slot.item;
              const isInteractive = Boolean(item);
              return (
                <div key={`${slot.kind}-${item ? item.id : `placeholder-${index}`}`} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 shadow-sm",
                      isInteractive ? "cursor-pointer hover:border-indigo-300" : "opacity-70",
                    )}
                    onClick={() => {
                      if (!item) return;
                      if (slot.kind === "ask") {
                        handleSelectAsk(item.id);
                      } else {
                        handleSelectChallenge(item.id);
                      }
                    }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {slot.kind === "ask" ? "Ask" : "Challenge"}
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {item ? item.title ?? "" : slot.placeholder}
                    </span>
                  </div>
                  {index < breadcrumbSlots.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.52fr)_minmax(0,0.48fr)]">
            <section className="space-y-5">
              {boardData.asks.map(ask => {
                const isSelected = selectedAskId === ask.id;
                const relatedChallengesForAsk = new Set<string>();
                ask.participants.forEach(participant => {
                  participant.insights.forEach(insight => {
                    insight.relatedChallengeIds.forEach(challengeId => {
                      relatedChallengesForAsk.add(challengeId);
                    });
                  });
                });

                return (
                  <motion.div
                    key={ask.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card
                      className={cn(
                        "overflow-hidden border border-slate-200/80 bg-white/80 shadow-sm transition",
                        isSelected && "border-indigo-400 shadow-md",
                      )}
                    >
                      <CardHeader className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/80 py-5">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="space-y-1">
                            <button
                              type="button"
                              className="text-left"
                              onClick={() => handleSelectAsk(ask.id)}
                            >
                              <CardTitle className="text-lg font-semibold text-slate-900">{ask.title}</CardTitle>
                              <p className="text-sm text-slate-600">{ask.summary}</p>
                            </button>
                          </div>
                          <div className="flex flex-col items-end gap-2 text-xs text-slate-500">
                            <span className="rounded-full bg-white px-3 py-1 font-semibold uppercase tracking-wide text-indigo-600">
                              {ask.theme}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium uppercase tracking-wide">
                              {ask.status}
                            </span>
                            <span className="text-[11px] uppercase tracking-wide text-slate-400">
                              Échéance {formatDateLabel(ask.dueDate)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {Array.from(relatedChallengesForAsk).map(challengeId => (
                            <button
                              key={challengeId}
                              type="button"
                              onClick={() => handleOpenChallengeFromInsight(challengeId)}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-white px-3 py-1 transition",
                                selectedChallengeId === challengeId && "border-indigo-400 bg-indigo-50 text-indigo-700",
                              )}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              <span>{challengeMap.get(challengeId)?.title ?? "Challenge"}</span>
                            </button>
                          ))}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6 py-6">
                        <div className="space-y-5">
                          {ask.participants.map(participant => {
                            const groupedInsights = groupInsightsByType(participant.insights);
                            const participantHasLink = participant.insights.some(insight =>
                              insight.relatedChallengeIds.includes(selectedChallengeId ?? ""),
                            );
                            return (
                              <div
                                key={participant.id}
                                className={cn(
                                  "rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4",
                                  participantHasLink && "border-indigo-300 bg-indigo-50/50",
                                )}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white",
                                        participant.avatarColor ?? "bg-slate-400",
                                      )}
                                    >
                                      {participant.avatarInitials}
                                    </span>
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">{participant.name}</p>
                                      <p className="text-xs text-slate-500">{participant.role}</p>
                                    </div>
                                  </div>
                                  <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
                                    {participant.insights.length} insights
                                  </span>
                                </div>
                                <div className="mt-4 space-y-4">
                                  {(Object.keys(groupedInsights) as InsightCategory[]).map(type => {
                                    const typeConfig = insightTypeConfig[type];
                                    const insights = groupedInsights[type];
                                    if (!insights || insights.length === 0) {
                                      return null;
                                    }
                                    const Icon = typeConfig.icon;
                                    return (
                                      <div key={type} className="space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          <Icon className="h-3.5 w-3.5" />
                                          <span>{typeConfig.label}</span>
                                        </div>
                                        <div className="space-y-3">
                                          {insights.map(insight => {
                                            const isLinkedToSelected = selectedChallengeId
                                              ? insight.relatedChallengeIds.includes(selectedChallengeId)
                                              : false;
                                            const isHovering = hoveredInsightId === insight.id || hoveredChallengeId
                                              ? insight.relatedChallengeIds.includes(hoveredChallengeId ?? "")
                                              : false;
                                            return (
                                              <div
                                                key={insight.id}
                                                className={cn(
                                                  "rounded-xl border-l-4 border-slate-200/80 bg-white p-4 shadow-sm transition",
                                                  isLinkedToSelected && "border-indigo-400 bg-indigo-50/80",
                                                  isHovering && !isLinkedToSelected && "border-indigo-200",
                                                )}
                                                onMouseEnter={() => setHoveredInsightId(insight.id)}
                                                onMouseLeave={() => setHoveredInsightId(prev => (prev === insight.id ? null : prev))}
                                              >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                  <div>
                                                    <p className="text-sm font-semibold text-slate-900">{insight.title}</p>
                                                    <p className="text-sm text-slate-600">{insight.description}</p>
                                                  </div>
                                                  <span
                                                    className={cn(
                                                      "rounded-full border px-2 py-1 text-xs font-medium uppercase tracking-wide",
                                                      typeConfig.badgeClass,
                                                    )}
                                                  >
                                                    {insight.isCompleted ? "Complété" : "En cours"}
                                                  </span>
                                                </div>
                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                  {insight.relatedChallengeIds.map(challengeId => (
                                                    <button
                                                      key={challengeId}
                                                      type="button"
                                                      onClick={() => handleOpenChallengeFromInsight(challengeId)}
                                                      className={cn(
                                                        "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs transition",
                                                        selectedChallengeId === challengeId && "border-indigo-400 bg-indigo-50 text-indigo-700",
                                                        hoveredChallengeId === challengeId && "border-indigo-300",
                                                      )}
                                                    >
                                                      <Link2 className="h-3 w-3" />
                                                      <span>{challengeMap.get(challengeId)?.title ?? "Challenge"}</span>
                                                    </button>
                                                  ))}
                                                </div>
                                                {insight.kpis.length > 0 && (
                                                  <dl className="mt-3 grid gap-2 text-xs text-slate-500">
                                                    {insight.kpis.map(kpi => (
                                                      <div
                                                        key={kpi.id}
                                                        className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2"
                                                      >
                                                        <dt className="font-medium text-slate-600">{kpi.label}</dt>
                                                        <dd className="font-mono text-slate-900">{formatKpiValue(kpi)}</dd>
                                                      </div>
                                                    ))}
                                                  </dl>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-100/60 p-4">
                          <p className="text-sm font-semibold text-slate-600">Ajouter un participant</p>
                          <form
                            className="mt-3 flex flex-wrap items-center gap-3"
                            onSubmit={event => {
                              event.preventDefault();
                              handleAddParticipant(ask.id);
                            }}
                          >
                            <div className="min-w-[220px] flex-1">
                              <Input
                                list={`available-users-${ask.id}`}
                                placeholder="Rechercher un membre..."
                                value={pendingUserInputs[ask.id] ?? ""}
                                onChange={event =>
                                  setPendingUserInputs(prev => ({ ...prev, [ask.id]: event.target.value }))
                                }
                              />
                              <datalist id={`available-users-${ask.id}`}>
                                {boardData.availableUsers.map(user => (
                                  <option key={user.id} value={user.name} />
                                ))}
                              </datalist>
                              {pendingUserErrors[ask.id] && (
                                <p className="mt-2 text-xs text-rose-500">{pendingUserErrors[ask.id]}</p>
                              )}
                            </div>
                            <Button type="submit" variant="outline" size="sm" className="gap-2">
                              <UserPlus className="h-4 w-4" />
                              Ajouter
                            </Button>
                          </form>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </section>

            <section className="space-y-5">
              {boardData.challenges.map(challenge => renderChallengeNode(challenge))}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
