"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AiAgentRecord, AiModelConfig, PromptVariableDefinition } from "@/types";

interface AgentsResponse {
  success: boolean;
  data?: {
    agents: AiAgentRecord[];
    variables: PromptVariableDefinition[];
  };
  error?: string;
}

interface ModelsResponse {
  success: boolean;
  data?: AiModelConfig[];
  error?: string;
}

type AgentDraft = AiAgentRecord & {
  systemPromptDraft: string;
  userPromptDraft: string;
  availableVariablesDraft: string[];
  modelConfigIdDraft: string | null;
  fallbackModelConfigIdDraft: string | null;
  isSaving?: boolean;
  saveError?: string | null;
  saveSuccess?: boolean;
};

function mergeAgentWithDraft(agent: AiAgentRecord): AgentDraft {
  return {
    ...agent,
    systemPromptDraft: agent.systemPrompt,
    userPromptDraft: agent.userPrompt,
    availableVariablesDraft: [...agent.availableVariables],
    modelConfigIdDraft: agent.modelConfigId ?? null,
    fallbackModelConfigIdDraft: agent.fallbackModelConfigId ?? null,
    isSaving: false,
    saveError: null,
    saveSuccess: false,
  };
}

export default function AiConfigurationPage() {
  const [agents, setAgents] = useState<AgentDraft[]>([]);
  const [models, setModels] = useState<AiModelConfig[]>([]);
  const [variables, setVariables] = useState<PromptVariableDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfiguration = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [agentsResponse, modelsResponse] = await Promise.all([
        fetch("/api/admin/ai/agents"),
        fetch("/api/admin/ai/models"),
      ]);

      const agentsJson: AgentsResponse = await agentsResponse.json();
      const modelsJson: ModelsResponse = await modelsResponse.json();

      if (!agentsJson.success) {
        throw new Error(agentsJson.error || "Impossible de charger les agents");
      }
      if (!modelsJson.success) {
        throw new Error(modelsJson.error || "Impossible de charger les modèles");
      }

      setAgents(agentsJson.data?.agents.map(mergeAgentWithDraft) ?? []);
      setVariables(agentsJson.data?.variables ?? []);
      setModels(modelsJson.data ?? []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Erreur inattendue lors du chargement");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfiguration();
  }, []);

  const handleToggleVariable = (agentId: string, variable: string) => {
    setAgents(prev => prev.map(agent => {
      if (agent.id !== agentId) {
        return agent;
      }
      const exists = agent.availableVariablesDraft.includes(variable);
      const updatedVariables = exists
        ? agent.availableVariablesDraft.filter(item => item !== variable)
        : [...agent.availableVariablesDraft, variable];
      return { ...agent, availableVariablesDraft: updatedVariables, saveSuccess: false };
    }));
  };

  const handlePromptChange = (agentId: string, field: "system" | "user", value: string) => {
    setAgents(prev => prev.map(agent => {
      if (agent.id !== agentId) {
        return agent;
      }
      if (field === "system") {
        return { ...agent, systemPromptDraft: value, saveSuccess: false };
      }
      return { ...agent, userPromptDraft: value, saveSuccess: false };
    }));
  };

  const handleModelChange = (agentId: string, field: "primary" | "fallback", value: string) => {
    setAgents(prev => prev.map(agent => {
      if (agent.id !== agentId) {
        return agent;
      }
      if (field === "primary") {
        return { ...agent, modelConfigIdDraft: value || null, saveSuccess: false };
      }
      return { ...agent, fallbackModelConfigIdDraft: value || null, saveSuccess: false };
    }));
  };

  const handleSaveAgent = async (agentId: string) => {
    setAgents(prev => prev.map(agent => agent.id === agentId ? { ...agent, isSaving: true, saveError: null, saveSuccess: false } : agent));

    const agent = agents.find(item => item.id === agentId);
    if (!agent) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/ai/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: agent.systemPromptDraft,
          userPrompt: agent.userPromptDraft,
          availableVariables: agent.availableVariablesDraft,
          modelConfigId: agent.modelConfigIdDraft,
          fallbackModelConfigId: agent.fallbackModelConfigIdDraft,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Impossible d'enregistrer l'agent");
      }

      setAgents(prev => prev.map(item => {
        if (item.id !== agentId) {
          return item;
        }
        return {
          ...item,
          systemPrompt: item.systemPromptDraft,
          userPrompt: item.userPromptDraft,
          availableVariables: [...item.availableVariablesDraft],
          modelConfigId: item.modelConfigIdDraft,
          fallbackModelConfigId: item.fallbackModelConfigIdDraft,
          isSaving: false,
          saveSuccess: true,
        };
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'enregistrement";
      setAgents(prev => prev.map(item => item.id === agentId ? { ...item, isSaving: false, saveError: message } : item));
    }
  };

  const sortedVariables = useMemo(() => {
    return [...variables].sort((a, b) => a.key.localeCompare(b.key));
  }, [variables]);

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuration des agents IA</h1>
          <p className="text-muted-foreground">Gérez les prompts et l'association aux modèles.</p>
        </div>
        <Button onClick={fetchConfiguration} disabled={isLoading}>
          Rafraîchir
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Erreur de chargement</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Variables disponibles</CardTitle>
          <CardDescription>Insérez ces variables dans vos prompts via la syntaxe {{variable}}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {sortedVariables.map(variable => (
            <div key={variable.key} className="rounded-lg border p-4 bg-muted/30">
              <p className="font-semibold">{variable.key}</p>
              <p className="text-sm text-muted-foreground">{variable.description}</p>
              {variable.example && (
                <p className="text-xs text-muted-foreground mt-2">Exemple : {variable.example}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        {isLoading && agents.length === 0 ? (
          <p className="text-muted-foreground">Chargement des agents...</p>
        ) : agents.length === 0 ? (
          <p className="text-muted-foreground">Aucun agent configuré pour le moment.</p>
        ) : (
          agents.map(agent => (
            <Card key={agent.id} className="border-primary/10">
              <CardHeader>
                <CardTitle>{agent.name}</CardTitle>
                {agent.description && <CardDescription>{agent.description}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Modèle principal</Label>
                    <select
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                      value={agent.modelConfigIdDraft ?? ''}
                      onChange={event => handleModelChange(agent.id, "primary", event.target.value)}
                    >
                      <option value="">Aucun</option>
                      {models.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name} — {model.model}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Modèle de secours</Label>
                    <select
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                      value={agent.fallbackModelConfigIdDraft ?? ''}
                      onChange={event => handleModelChange(agent.id, "fallback", event.target.value)}
                    >
                      <option value="">Aucun</option>
                      {models.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name} — {model.model}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`system-${agent.id}`}>System prompt</Label>
                    <Textarea
                      id={`system-${agent.id}`}
                      value={agent.systemPromptDraft}
                      onChange={event => handlePromptChange(agent.id, "system", event.target.value)}
                      rows={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`user-${agent.id}`}>User prompt</Label>
                    <Textarea
                      id={`user-${agent.id}`}
                      value={agent.userPromptDraft}
                      onChange={event => handlePromptChange(agent.id, "user", event.target.value)}
                      rows={8}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Variables actives</Label>
                  <div className="flex flex-wrap gap-2">
                    {sortedVariables.map(variable => {
                      const isActive = agent.availableVariablesDraft.includes(variable.key);
                      return (
                        <button
                          key={variable.key}
                          type="button"
                          onClick={() => handleToggleVariable(agent.id, variable.key)}
                          className={`px-3 py-1 text-sm rounded-full border transition ${isActive ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-muted-foreground/20'}`}
                        >
                          {variable.key}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {agent.saveError && (
                  <p className="text-sm text-destructive">{agent.saveError}</p>
                )}
                {agent.saveSuccess && (
                  <p className="text-sm text-emerald-600">Modifications enregistrées.</p>
                )}

                <Button
                  onClick={() => handleSaveAgent(agent.id)}
                  disabled={agent.isSaving}
                >
                  {agent.isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
