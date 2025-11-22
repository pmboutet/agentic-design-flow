"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Play, X } from "lucide-react";

interface AgentTestModeProps {
  agentId: string;
  agentSlug: string;
  onClose: () => void;
}

interface TestResult {
  systemPrompt: string;
  userPrompt: string;
  metadata?: {
    messagesCount?: number;
    participantsCount?: number;
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

export function AgentTestMode({ agentId, agentSlug, onClose }: AgentTestModeProps) {
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
  const isAskAgent = slug.includes("conversation") || slug.includes("chat") || slug.includes("ask-conversation");
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
  useEffect(() => {
    if (!selectedAskId || (!isAskAgent && !isInsightAgent)) {
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
  }, [selectedAskId, isAskAgent, isInsightAgent]);

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
        if (!selectedParticipantUserId) {
          setError("Veuillez sélectionner un participant (utilisateur) pour simuler");
          setIsLoading(false);
          return;
        }
        body.askSessionId = selectedAskId;
        body.userId = selectedParticipantUserId;
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
    <Card className="border-primary/20 mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Mode test</CardTitle>
            <CardDescription>
              Testez votre agent avec des données réelles pour voir les prompts fusionnés
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Context selectors */}
        <div className="space-y-4">
          {isAskAgent || isInsightAgent ? (
            <>
              <div className="space-y-2">
                <Label>Sélectionner une session ASK</Label>
                <select
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
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
              {selectedAskId && (
                <div className="space-y-2">
                  <Label>Sélectionner un participant (pour simuler sa perspective)</Label>
                  <select
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
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
                    <p className="text-xs text-muted-foreground">Chargement des participants...</p>
                  )}
                  {!isLoadingParticipants && participants.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      ⚠️ Aucun participant avec compte utilisateur trouvé pour cette session
                    </p>
                  )}
                  {!isLoadingParticipants && participants.filter(p => p.user_id).length === 0 && participants.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      ⚠️ Aucun participant n'a de compte utilisateur lié (user_id)
                    </p>
                  )}
                </div>
              )}
            </>
          ) : isAskGenerator ? (
            <>
              <div className="space-y-2">
                <Label>Sélectionner un projet</Label>
                <select
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
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
                <Label>Sélectionner un challenge</Label>
                <select
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
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
                <Label>Sélectionner un projet</Label>
                <select
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
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
                <Label>Sélectionner un challenge</Label>
                <select
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
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

          <Button onClick={handleTest} disabled={isLoading || isLoadingData} className="w-full">
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
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {testResult && (
          <div className="space-y-4 mt-4">
            {/* Metadata Badge */}
            {testResult.metadata && (
              <div className="flex flex-wrap gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">📊 Données réelles :</span>
                  {testResult.metadata.messagesCount !== undefined && (
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {testResult.metadata.messagesCount} message{testResult.metadata.messagesCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {testResult.metadata.participantsCount !== undefined && (
                    <>
                      <span className="text-blue-400 dark:text-blue-600">•</span>
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        {testResult.metadata.participantsCount} participant{testResult.metadata.participantsCount !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                  {testResult.metadata.hasProject && (
                    <>
                      <span className="text-blue-400 dark:text-blue-600">•</span>
                      <span className="text-xs text-green-600 dark:text-green-400">✓ Projet</span>
                    </>
                  )}
                  {testResult.metadata.hasChallenge && (
                    <>
                      <span className="text-blue-400 dark:text-blue-600">•</span>
                      <span className="text-xs text-green-600 dark:text-green-400">✓ Challenge</span>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>System Prompt (fusionné avec données réelles)</Label>
              <div className="rounded-lg border bg-muted/30 p-3 max-h-64 overflow-y-auto overflow-x-hidden">
                <pre className="text-xs whitespace-pre-wrap break-words">{testResult.systemPrompt}</pre>
              </div>
            </div>
            <div className="space-y-2">
              <Label>User Prompt (fusionné avec données réelles)</Label>
              <div className="rounded-lg border bg-muted/30 p-3 max-h-64 overflow-y-auto overflow-x-hidden">
                <pre className="text-xs whitespace-pre-wrap break-words">{testResult.userPrompt}</pre>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}




