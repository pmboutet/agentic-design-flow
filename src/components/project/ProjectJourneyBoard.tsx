"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  ChevronRight,
  Lightbulb,
  Target,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getMockProjectJourneyData } from "@/lib/mockProjectJourney";
import {
  ProjectAskOverview,
  ProjectChallengeNode,
  ProjectJourneyBoardData,
  ProjectParticipantInsight,
} from "@/types";

interface ProjectJourneyBoardProps {
  projectId: string;
}

interface ChallengeInsightRow extends ProjectParticipantInsight {
  participantName: string;
  askId: string;
  askTitle: string;
}

interface AskInsightRow extends ProjectParticipantInsight {
  participantName: string;
}

const impactLabels: Record<ProjectChallengeNode["impact"], string> = {
  low: "Impact faible",
  medium: "Impact modéré",
  high: "Fort impact",
  critical: "Impact critique",
};

const impactClasses: Record<ProjectChallengeNode["impact"], string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-100",
  medium: "bg-amber-50 text-amber-700 border-amber-100",
  high: "bg-indigo-50 text-indigo-700 border-indigo-100",
  critical: "bg-rose-50 text-rose-700 border-rose-100",
};

const insightTypeClasses: Record<ProjectParticipantInsight["type"], string> = {
  pain: "bg-rose-50 text-rose-700 border-rose-200",
  gain: "bg-emerald-50 text-emerald-700 border-emerald-200",
  signal: "bg-sky-50 text-sky-700 border-sky-200",
  idea: "bg-amber-50 text-amber-700 border-amber-200",
};

function flattenChallenges(nodes: ProjectChallengeNode[]): ProjectChallengeNode[] {
  return nodes.flatMap(node => [node, ...(node.children ? flattenChallenges(node.children) : [])]);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function ProjectJourneyBoard({ projectId }: ProjectJourneyBoardProps) {
  const [boardData] = useState<ProjectJourneyBoardData>(() => getMockProjectJourneyData(projectId));

  const allChallenges = useMemo(() => flattenChallenges(boardData.challenges), [boardData.challenges]);

  const challengeInsightMap = useMemo(() => {
    const map = new Map<string, ChallengeInsightRow[]>();
    boardData.asks.forEach(ask => {
      ask.participants.forEach(participant => {
        participant.insights.forEach(insight => {
          insight.relatedChallengeIds.forEach(challengeId => {
            const rows = map.get(challengeId) ?? [];
            rows.push({
              ...insight,
              participantName: participant.name,
              askId: ask.id,
              askTitle: ask.title,
            });
            map.set(challengeId, rows);
          });
        });
      });
    });
    return map;
  }, [boardData.asks]);

  const asksByChallenge = useMemo(() => {
    const map = new Map<string, ProjectAskOverview[]>();
    boardData.asks.forEach(ask => {
      ask.originatingChallengeIds.forEach(challengeId => {
        const list = map.get(challengeId) ?? [];
        list.push(ask);
        map.set(challengeId, list);
      });
    });
    return map;
  }, [boardData.asks]);

  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(() => allChallenges[0]?.id ?? null);

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

  const renderChallengeList = (nodes: ProjectChallengeNode[], depth = 0) => {
    return (
      <div className={cn("space-y-3", depth > 0 && "border-l border-slate-200/60 pl-4")}> 
        {nodes.map(node => {
            const isActive = activeChallengeId === node.id;
            const insightCount = challengeInsightMap.get(node.id)?.length ?? 0;
            return (
              <Card
                key={node.id}
                className={cn(
                  "border border-slate-200/80 bg-white/80 transition hover:border-indigo-300",
                  isActive && "border-indigo-500 shadow-md",
                )}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setActiveChallengeId(node.id)}
                >
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-2">
                        <CardTitle className="text-base font-semibold text-slate-900">{node.title}</CardTitle>
                        <p className="text-sm text-slate-600">{node.description}</p>
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-5 w-5 text-slate-400 transition-transform",
                          isActive && "text-indigo-500 rotate-90",
                        )}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                      <span className={cn("rounded-full border px-2.5 py-1", impactClasses[node.impact])}>
                        {impactLabels[node.impact]}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        <Lightbulb className="h-3.5 w-3.5" />
                        {insightCount} insight{insightCount > 1 ? "s" : ""}
                      </span>
                      {node.owner ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                          <Users className="h-3.5 w-3.5" />
                          {node.owner}
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>
                </button>
                {node.children?.length ? (
                  <CardContent className="border-t border-slate-100 pt-4">
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
    const rows: AskInsightRow[] = ask.participants.flatMap(participant =>
      participant.insights.map(insight => ({
        ...insight,
        participantName: participant.name,
      })),
    );

    if (rows.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Aucun insight n'a encore été publié pour cet ASK.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.id} className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
              <span className={cn("rounded-full border px-2 py-0.5", insightTypeClasses[row.type])}>
                {row.type.toUpperCase()}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                {row.participantName}
              </span>
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(row.updatedAt)}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900">{row.title}</p>
            <p className="mt-1 text-sm text-slate-600">{row.description}</p>
            {row.relatedChallengeIds.length ? (
              <div className="mt-2 text-xs text-slate-500">
                Lié à {row.relatedChallengeIds.length} challenge{row.relatedChallengeIds.length > 1 ? "s" : ""}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <header className="rounded-xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Projet</p>
            <h1 className="text-2xl font-semibold text-slate-900">{boardData.projectName}</h1>
            <p className="mt-1 text-sm text-slate-600">Client : {boardData.clientName}</p>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              <Target className="h-4 w-4" />
              {boardData.projectGoal}
            </span>
            <span className="inline-flex items-center gap-2 text-slate-600">
              <Calendar className="h-4 w-4" /> {boardData.timeframe}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Challenges du projet</h2>
            <p className="text-sm text-slate-600">
              Sélectionnez un challenge pour explorer les insights qui l'ont fait émerger et les ASKs associés.
            </p>
          </div>
          {boardData.challenges.length ? (
            renderChallengeList(boardData.challenges)
          ) : (
            <Card className="border-dashed border-slate-200 bg-white/60">
              <CardContent className="py-10 text-center text-sm text-slate-500">
                Aucun challenge n'est encore défini pour ce projet.
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {activeChallenge ? `Asks liés à « ${activeChallenge.title} »` : "Sélectionnez un challenge"}
              </h2>
              <p className="text-sm text-slate-600">
                Visualisez les sessions ASK planifiées pour instruire ce challenge, les insights générés et leurs rattachements
                projets.
              </p>
            </div>
          </div>

          {!activeChallenge ? (
            <Card className="border-dashed border-slate-200 bg-white/60">
              <CardContent className="py-10 text-center text-sm text-slate-500">
                Sélectionnez un challenge dans la colonne de gauche pour découvrir les ASKs correspondants.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="border border-slate-200 bg-white/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Insights fondateurs
                  </CardTitle>
                  <p className="text-sm text-slate-600">
                    Ces insights ont permis de formuler le challenge « {activeChallenge.title} ».
                  </p>
                </CardHeader>
                <CardContent>
                  {activeChallengeInsights.length ? (
                    <div className="space-y-3">
                      {activeChallengeInsights.map(insight => (
                        <div key={`${insight.id}-${insight.askId}`} className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                            <span className={cn("rounded-full border px-2 py-0.5", insightTypeClasses[insight.type])}>
                              {insight.type.toUpperCase()}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3.5 w-3.5 text-slate-400" />
                              {insight.participantName}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              {formatDate(insight.updatedAt)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Lightbulb className="h-3.5 w-3.5 text-slate-400" />
                              ASK : {insight.askTitle}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{insight.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{insight.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      Aucun insight ne référence encore ce challenge.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                {activeChallengeAsks.length ? (
                  activeChallengeAsks.map(ask => (
                    <Card key={ask.id} className="border border-slate-200 bg-white/80 shadow-sm">
                      <CardHeader className="space-y-3 pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <CardTitle className="text-base font-semibold text-slate-900">{ask.title}</CardTitle>
                            <p className="mt-1 text-sm text-slate-600">{ask.summary}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                              <Calendar className="h-3.5 w-3.5" /> Échéance {formatDate(ask.dueDate)}
                            </span>
                            <span className="text-slate-600">Statut : {ask.status}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                            <Target className="h-3.5 w-3.5" /> {ask.theme}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                            <Users className="h-3.5 w-3.5" /> {ask.participants.length} participant{ask.participants.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-600">Projets liés :</span>
                          {ask.relatedProjects.length ? (
                            ask.relatedProjects.map(project => (
                              <span
                                key={project.id}
                                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1"
                              >
                                {project.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500">Projet courant uniquement</span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <h3 className="text-sm font-semibold text-slate-800">Insights produits</h3>
                        {renderAskInsights(ask)}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="border-dashed border-slate-200 bg-white/60">
                    <CardContent className="py-10 text-center text-sm text-slate-500">
                      Aucun ASK n'est encore planifié pour ce challenge.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
