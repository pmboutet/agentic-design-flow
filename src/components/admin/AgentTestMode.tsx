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
  variables: Record<string, string>;
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

export function AgentTestMode({ agentId, agentSlug, onClose }: AgentTestModeProps) {
  const [askSessions, setAskSessions] = useState<AskSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedAskId, setSelectedAskId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
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
        body.askSessionId = selectedAskId;
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
            <div className="space-y-2">
              <Label>System Prompt (fusionné)</Label>
              <div className="rounded-lg border bg-muted/30 p-3 max-h-64 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap">{testResult.systemPrompt}</pre>
              </div>
            </div>
            <div className="space-y-2">
              <Label>User Prompt (fusionné)</Label>
              <div className="rounded-lg border bg-muted/30 p-3 max-h-64 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap">{testResult.userPrompt}</pre>
              </div>
            </div>
            <details className="space-y-2">
              <summary className="cursor-pointer text-sm font-medium">Variables utilisées (cliquer pour voir)</summary>
              <div className="rounded-lg border bg-muted/30 p-3 max-h-48 overflow-y-auto">
                <pre className="text-xs">{JSON.stringify(testResult.variables, null, 2)}</pre>
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

