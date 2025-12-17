"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Play, X } from "lucide-react";

interface ColorScheme {
  border: string;
  bg: string;
  text: string;
  badge: string;
}

interface AgentTestModeProps {
  agentId: string;
  agentSlug: string;
  onClose: () => void;
  colorScheme?: ColorScheme;
}

interface TestResult {
  systemPrompt: string;
  userPrompt: string;
  resolvedVariables?: Record<string, string>;
  metadata?: {
    messagesCount?: number;
    participantsCount?: number;
    insightsCount?: number;
    hasProject?: boolean;
    hasChallenge?: boolean;
  };
}

interface AskSession {
  id: string;
  ask_key: string;
  question: string;
}

interface Project {
  id: string;
  name: string;
}

interface Challenge {
  id: string;
  name: string;
}

interface Participant {
  id: string;
  user_id: string | null;
  participant_name: string | null;
  participant_email: string | null;
}

/**
 * Highlights variable values in the prompt text with colored spans
 * Uses a similar style to n8n for variable highlighting
 */
function HighlightedPrompt({
  text,
  resolvedVariables
}: {
  text: string;
  resolvedVariables?: Record<string, string>;
}) {
  if (!resolvedVariables || Object.keys(resolvedVariables).length === 0) {
    return <pre className="text-xs whitespace-pre-wrap break-words text-slate-300">{text}</pre>;
  }

  // Sort variables by value length (longest first) to avoid partial matches
  const sortedVars = Object.entries(resolvedVariables)
    .filter(([_, value]) => value && value.trim().length > 0)
    .sort((a, b) => b[1].length - a[1].length);

  if (sortedVars.length === 0) {
    return <pre className="text-xs whitespace-pre-wrap break-words text-slate-300">{text}</pre>;
  }

  // Create segments with highlighting
  interface Segment {
    text: string;
    isVariable: boolean;
    variableName?: string;
  }

  const segments: Segment[] = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    let earliestMatch: { index: number; variable: string; value: string } | null = null;

    // Find the earliest match among all variables
    for (const [variable, value] of sortedVars) {
      // Skip very short values to avoid false positives
      if (value.length < 3) continue;

      const index = remainingText.indexOf(value);
      if (index !== -1) {
        if (!earliestMatch || index < earliestMatch.index) {
          earliestMatch = { index, variable, value };
        }
      }
    }

    if (earliestMatch) {
      // Add text before the match
      if (earliestMatch.index > 0) {
        segments.push({
          text: remainingText.substring(0, earliestMatch.index),
          isVariable: false,
        });
      }
      // Add the matched variable
      segments.push({
        text: earliestMatch.value,
        isVariable: true,
        variableName: earliestMatch.variable,
      });
      remainingText = remainingText.substring(earliestMatch.index + earliestMatch.value.length);
    } else {
      // No more matches, add remaining text
      segments.push({
        text: remainingText,
        isVariable: false,
      });
      break;
    }
  }

  return (
    <pre className="text-xs whitespace-pre-wrap break-words text-slate-300">
      {segments.map((segment, index) => {
        if (segment.isVariable) {
          return (
            <span
              key={index}
              className="bg-cyan-500/25 text-cyan-200 rounded px-0.5 border border-cyan-400/50 font-medium"
              title={`Variable: {{${segment.variableName}}}`}
            >
              {segment.text}
            </span>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </pre>
  );
}

export function AgentTestMode({ agentId, agentSlug, onClose, colorScheme }: AgentTestModeProps) {
  // Default color scheme (slate/gray) if not provided
  const colors = colorScheme || {
    border: "border-slate-400/40",
    bg: "bg-slate-500/10",
    text: "text-slate-200",
    badge: "bg-slate-700 text-slate-200",
  };
  const [askSessions, setAskSessions] = useState<AskSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedAskId, setSelectedAskId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>("");
  const [selectedParticipantUserId, setSelectedParticipantUserId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slug = agentSlug.toLowerCase();
  // Consultant agents also need ASK session context (they use shared thread, no participant needed)
  const isConsultantAgent = slug.includes("consultant");
  const isAskAgent = slug.includes("conversation") || slug.includes("chat") || slug.includes("ask-conversation") || isConsultantAgent;
  const isInsightAgent = slug.includes("insight-detection") || slug.includes("insight");
  const isAskGenerator = slug.includes("ask-generator") || slug.includes("generator");
  const isChallengeBuilder = slug.includes("challenge") || slug.includes("builder");

  // Load context data based on agent type
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      try {
        if (isAskAgent || isInsightAgent) {
          // Load ASK sessions
          const askResponse = await fetch("/api/admin/asks", { credentials: "include" });
          if (askResponse.ok) {
            const data = await askResponse.json();
            if (data.success && data.data) {
              setAskSessions(data.data.map((ask: any) => ({
                id: ask.id,
                ask_key: ask.askKey || ask.id,
                question: ask.question || "",
              })));
            }
          }
        } else if (isAskGenerator || isChallengeBuilder) {
          // Load projects first
          const projectResponse = await fetch("/api/admin/projects", { credentials: "include" });
          if (projectResponse.ok) {
            const data = await projectResponse.json();
            if (data.success && data.data) {
              setProjects(data.data.map((p: any) => ({
                id: p.id,
                name: p.name || "",
              })));
            }
          }
        }
      } catch (err) {
        console.error("Error loading test data:", err);
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [isAskAgent, isInsightAgent, isAskGenerator, isChallengeBuilder]);

  // Load challenges when project is selected
  useEffect(() => {
    if (!selectedProjectId) {
      setChallenges([]);
      setSelectedChallengeId("");
      return;
    }

    const loadChallenges = async () => {
      try {
        const response = await fetch(`/api/admin/projects/${selectedProjectId}/challenges`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setChallenges(data.data.map((c: any) => ({
              id: c.id,
              name: c.name || "",
            })));
          }
        }
      } catch (err) {
        console.error("Error loading challenges:", err);
      }
    };

    loadChallenges();
  }, [selectedProjectId]);

  // Load participants when ASK session is selected
  // Note: Consultant agents use shared thread, so they don't need participant selection
  useEffect(() => {
    if (!selectedAskId || (!isAskAgent && !isInsightAgent) || isConsultantAgent) {
      setParticipants([]);
      setSelectedParticipantUserId("");
      return;
    }

    const loadParticipants = async () => {
      setIsLoadingParticipants(true);
      try {
        const response = await fetch(`/api/admin/asks/${selectedAskId}/participants`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const participantsList = data.data.map((p: any) => ({
              id: p.id,
              user_id: p.userId || p.user_id || null,
              participant_name: p.participantName || p.participant_name || null,
              participant_email: p.participantEmail || p.participant_email || null,
            }));
            setParticipants(participantsList);
            // Auto-select first participant with user_id
            const firstWithUser = participantsList.find((p: Participant) => p.user_id);
            if (firstWithUser) {
              setSelectedParticipantUserId(firstWithUser.user_id);
            }
          }
        }
      } catch (err) {
        console.error("Error loading participants:", err);
      } finally {
        setIsLoadingParticipants(false);
      }
    };

    loadParticipants();
  }, [selectedAskId, isAskAgent, isInsightAgent, isConsultantAgent]);

  const handleTest = async () => {
    setIsLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const body: any = {};
      if (isAskAgent || isInsightAgent) {
        if (!selectedAskId) {
          setError("Veuillez sélectionner une session ASK");
          setIsLoading(false);
          return;
        }
        // Consultant agents use shared thread, so they don't need participant selection
        if (!isConsultantAgent && !selectedParticipantUserId) {
          setError("Veuillez sélectionner un participant (utilisateur) pour simuler");
          setIsLoading(false);
          return;
        }
        body.askSessionId = selectedAskId;
        // For consultant agents, userId is null (uses shared thread)
        body.userId = isConsultantAgent ? null : selectedParticipantUserId;
      } else if (isAskGenerator) {
        if (!selectedChallengeId) {
          setError("Veuillez sélectionner un challenge");
          setIsLoading(false);
          return;
        }
        body.challengeId = selectedChallengeId;
      } else if (isChallengeBuilder) {
        if (!selectedProjectId || !selectedChallengeId) {
          setError("Veuillez sélectionner un projet et un challenge");
          setIsLoading(false);
          return;
        }
        body.projectId = selectedProjectId;
        body.challengeId = selectedChallengeId;
      }

      const response = await fetch(`/api/admin/ai/agents/${agentId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erreur lors du test");
      }

      setTestResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`rounded-xl ${colors.border} ${colors.bg} mt-4 backdrop-blur-sm`}>
      <div className="flex flex-col space-y-1.5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-100">Mode test</h3>
            <p className="text-sm text-slate-400">
              Testez votre agent avec des données réelles pour voir les prompts fusionnés
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/50">
            <X className="h-4 w-4 mr-1" />
            <span>Fermer</span>
          </Button>
        </div>
      </div>
      <div className="p-6 pt-0 space-y-4">
        {/* Context selectors */}
        <div className="space-y-4">
          {isAskAgent || isInsightAgent ? (
            <>
              <div className="space-y-2">
                <Label className="text-slate-300">Sélectionner une session ASK</Label>
                <select
                  className="w-full rounded-md border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-100"
                  value={selectedAskId}
                  onChange={(e) => setSelectedAskId(e.target.value)}
                  disabled={isLoadingData}
                >
                  <option value="">-- Sélectionner une ASK --</option>
                  {askSessions.map((ask) => (
                    <option key={ask.id} value={ask.id}>
                      {ask.ask_key} - {ask.question}
                    </option>
                  ))}
                </select>
              </div>
              {selectedAskId && isConsultantAgent && (
                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-600/40">
                  <p className="text-xs text-slate-400">
                    Les agents consultant utilisent un thread partagé. Tous les messages de la session seront inclus.
                  </p>
                </div>
              )}
              {selectedAskId && !isConsultantAgent && (
                <div className="space-y-2">
                  <Label className="text-slate-300">Sélectionner un participant (pour simuler sa perspective)</Label>
                  <select
                    className="w-full rounded-md border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-100"
                    value={selectedParticipantUserId}
                    onChange={(e) => setSelectedParticipantUserId(e.target.value)}
                    disabled={isLoadingParticipants || participants.length === 0}
                  >
                    <option value="">-- Sélectionner un participant --</option>
                    {participants
                      .filter(p => p.user_id) // Only show participants with user_id
                      .map((participant) => (
                        <option key={participant.id} value={participant.user_id!}>
                          {participant.participant_name || participant.participant_email || participant.user_id}
                        </option>
                      ))}
                  </select>
                  {isLoadingParticipants && (
                    <p className="text-xs text-slate-400">Chargement des participants...</p>
                  )}
                  {!isLoadingParticipants && participants.length === 0 && (
                    <p className="text-xs text-amber-400">
                      ⚠️ Aucun participant avec compte utilisateur trouvé pour cette session
                    </p>
                  )}
                  {!isLoadingParticipants && participants.filter(p => p.user_id).length === 0 && participants.length > 0 && (
                    <p className="text-xs text-amber-400">
                      ⚠️ Aucun participant n'a de compte utilisateur lié (user_id)
                    </p>
                  )}
                </div>
              )}
            </>
          ) : isAskGenerator ? (
            <>
              <div className="space-y-2">
                <Label className="text-slate-300">Sélectionner un projet</Label>
                <select
                  className="w-full rounded-md border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-100"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  disabled={isLoadingData}
                >
                  <option value="">-- Sélectionner un projet --</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Sélectionner un challenge</Label>
                <select
                  className="w-full rounded-md border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-100"
                  value={selectedChallengeId}
                  onChange={(e) => setSelectedChallengeId(e.target.value)}
                  disabled={!selectedProjectId || isLoadingData}
                >
                  <option value="">-- Sélectionner un challenge --</option>
                  {challenges.map((challenge) => (
                    <option key={challenge.id} value={challenge.id}>
                      {challenge.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : isChallengeBuilder ? (
            <>
              <div className="space-y-2">
                <Label className="text-slate-300">Sélectionner un projet</Label>
                <select
                  className="w-full rounded-md border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-100"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  disabled={isLoadingData}
                >
                  <option value="">-- Sélectionner un projet --</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Sélectionner un challenge</Label>
                <select
                  className="w-full rounded-md border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-100"
                  value={selectedChallengeId}
                  onChange={(e) => setSelectedChallengeId(e.target.value)}
                  disabled={!selectedProjectId || isLoadingData}
                >
                  <option value="">-- Sélectionner un challenge --</option>
                  {challenges.map((challenge) => (
                    <option key={challenge.id} value={challenge.id}>
                      {challenge.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          <Button
            onClick={handleTest}
            disabled={isLoading || isLoadingData}
            className={`w-full ${colors.border} ${colors.bg} text-slate-100 hover:bg-slate-700/50`}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Test en cours...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Tester
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {testResult && (
          <div className="space-y-4 mt-4">
            {/* Metadata Badge */}
            {testResult.metadata && (
              <div className="flex flex-wrap gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-600/40">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-slate-300">📊 Données réelles :</span>
                  {testResult.metadata.messagesCount !== undefined && (
                    <span className="text-xs text-blue-400">
                      {testResult.metadata.messagesCount} message{testResult.metadata.messagesCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {testResult.metadata.participantsCount !== undefined && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span className="text-xs text-blue-400">
                        {testResult.metadata.participantsCount} participant{testResult.metadata.participantsCount !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                  {testResult.metadata.insightsCount !== undefined && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span className="text-xs text-purple-400">
                        {testResult.metadata.insightsCount} insight{testResult.metadata.insightsCount !== 1 ? 's' : ''} existant{testResult.metadata.insightsCount !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                  {testResult.metadata.hasProject && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span className="text-xs text-emerald-400">✓ Projet</span>
                    </>
                  )}
                  {testResult.metadata.hasChallenge && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span className="text-xs text-emerald-400">✓ Challenge</span>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-slate-300">System Prompt (fusionné avec données réelles)</Label>
              <div className="rounded-lg border border-slate-600/40 bg-slate-900/50 p-3 max-h-64 overflow-y-auto overflow-x-hidden">
                <HighlightedPrompt
                  text={testResult.systemPrompt}
                  resolvedVariables={testResult.resolvedVariables}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">User Prompt (fusionné avec données réelles)</Label>
              <div className="rounded-lg border border-slate-600/40 bg-slate-900/50 p-3 max-h-64 overflow-y-auto overflow-x-hidden">
                <HighlightedPrompt
                  text={testResult.userPrompt}
                  resolvedVariables={testResult.resolvedVariables}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}





