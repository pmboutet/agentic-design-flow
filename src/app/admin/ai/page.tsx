"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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

type NewAgentDraft = {
  slug: string;
  name: string;
  description: string;
  systemPrompt: string;
  userPrompt: string;
  availableVariables: string[];
  modelConfigId: string | null;
  fallbackModelConfigId: string | null;
  slugManuallyEdited: boolean;
  isSaving: boolean;
  error: string | null;
  successMessage: string | null;
};

interface CreateAgentResponse {
  success: boolean;
  data?: AiAgentRecord;
  error?: string;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createEmptyNewAgentDraft(): NewAgentDraft {
  return {
    slug: "",
    name: "",
    description: "",
    systemPrompt: "",
    userPrompt: "",
    availableVariables: [],
    modelConfigId: null,
    fallbackModelConfigId: null,
    slugManuallyEdited: false,
    isSaving: false,
    error: null,
    successMessage: null,
  };
}

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
  const [isCreating, setIsCreating] = useState(false);
  const [newAgent, setNewAgent] = useState<NewAgentDraft>(() => createEmptyNewAgentDraft());

  const fetchConfiguration = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [agentsResponse, modelsResponse] = await Promise.all([
        fetch("/api/admin/ai/agents", { credentials: "include" }),
        fetch("/api/admin/ai/models", { credentials: "include" }),
      ]);

      if (!agentsResponse.ok) {
        throw new Error("Impossible de charger les agents");
      }
      if (!modelsResponse.ok) {
        throw new Error("Impossible de charger les modèles");
      }

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

  const handleToggleCreateForm = () => {
    setIsCreating(prev => {
      const next = !prev;
      if (!next) {
        setNewAgent(createEmptyNewAgentDraft());
      }
      return next;
    });
  };

  const handleNewAgentNameChange = (value: string) => {
    setNewAgent(prev => {
      const shouldUpdateSlug = !prev.slugManuallyEdited;
      return {
        ...prev,
        name: value,
        slug: shouldUpdateSlug ? slugify(value) : prev.slug,
        error: null,
        successMessage: null,
      };
    });
  };

  const handleNewAgentSlugChange = (value: string) => {
    setNewAgent(prev => ({
      ...prev,
      slug: value,
      slugManuallyEdited: true,
      error: null,
      successMessage: null,
    }));
  };

  const handleNewAgentDescriptionChange = (value: string) => {
    setNewAgent(prev => ({
      ...prev,
      description: value,
      error: null,
      successMessage: null,
    }));
  };

  const handleNewAgentPromptChange = (field: "system" | "user", value: string) => {
    setNewAgent(prev => ({
      ...prev,
      systemPrompt: field === "system" ? value : prev.systemPrompt,
      userPrompt: field === "user" ? value : prev.userPrompt,
      error: null,
      successMessage: null,
    }));
  };

  const handleNewAgentModelChange = (field: "primary" | "fallback", value: string) => {
    setNewAgent(prev => ({
      ...prev,
      modelConfigId: field === "primary" ? (value || null) : prev.modelConfigId,
      fallbackModelConfigId: field === "fallback" ? (value || null) : prev.fallbackModelConfigId,
      error: null,
      successMessage: null,
    }));
  };

  const handleNewAgentToggleVariable = (variable: string) => {
    setNewAgent(prev => {
      const exists = prev.availableVariables.includes(variable);
      const updated = exists
        ? prev.availableVariables.filter(item => item !== variable)
        : [...prev.availableVariables, variable];

      return {
        ...prev,
        availableVariables: updated,
        error: null,
        successMessage: null,
      };
    });
  };

  const handleResetNewAgentForm = () => {
    setNewAgent(createEmptyNewAgentDraft());
  };

  const handleCreateAgent = async () => {
    setNewAgent(prev => ({ ...prev, isSaving: true, error: null, successMessage: null }));

    try {
      const slugValue = newAgent.slug.trim();
      const response = await fetch("/api/admin/ai/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          slug: slugValue.length > 0 ? slugValue : undefined,
          name: newAgent.name,
          description: newAgent.description.trim().length > 0 ? newAgent.description : null,
          systemPrompt: newAgent.systemPrompt,
          userPrompt: newAgent.userPrompt,
          availableVariables: newAgent.availableVariables,
          modelConfigId: newAgent.modelConfigId,
          fallbackModelConfigId: newAgent.fallbackModelConfigId,
        }),
      });

      const result: CreateAgentResponse = await response.json();

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || "Impossible de créer l'agent");
      }

      const createdAgent = result.data;

      setAgents(prev => [...prev, mergeAgentWithDraft(createdAgent)]);
      setNewAgent({
        ...createEmptyNewAgentDraft(),
        successMessage: `Agent "${createdAgent.name}" créé avec succès.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de la création de l'agent";
      setNewAgent(prev => ({ ...prev, isSaving: false, error: message }));
    }
  };

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
        credentials: "include",
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

  const isCreateDisabled =
    newAgent.isSaving ||
    newAgent.name.trim().length === 0 ||
    newAgent.systemPrompt.trim().length === 0 ||
    newAgent.userPrompt.trim().length === 0;

  return (
    <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Configuration des agents IA</h1>
            <p className="text-muted-foreground">Gérez les prompts et l'association aux modèles.</p>
          </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleToggleCreateForm}
            disabled={newAgent.isSaving}
          >
            {isCreating ? "Fermer" : "Nouvel agent"}
          </Button>
          <Button onClick={fetchConfiguration} disabled={isLoading}>
            Rafraîchir
          </Button>
        </div>
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

      {isCreating && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Nouvel agent IA</CardTitle>
            <CardDescription>Définissez le prompt, les variables et le modèle associé.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-agent-name">Nom</Label>
                <Input
                  id="new-agent-name"
                  placeholder="Agent conversationnel"
                  value={newAgent.name}
                  onChange={event => handleNewAgentNameChange(event.target.value)}
                  disabled={newAgent.isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-agent-slug">Identifiant (slug)</Label>
                <Input
                  id="new-agent-slug"
                  placeholder="agent-conversationnel"
                  value={newAgent.slug}
                  onChange={event => handleNewAgentSlugChange(event.target.value)}
                  disabled={newAgent.isSaving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-agent-description">Description</Label>
              <Textarea
                id="new-agent-description"
                value={newAgent.description}
                onChange={event => handleNewAgentDescriptionChange(event.target.value)}
                rows={3}
                placeholder="Résumé de l'utilisation de cet agent."
                disabled={newAgent.isSaving}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Modèle principal</Label>
                <select
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  value={newAgent.modelConfigId ?? ''}
                  onChange={event => handleNewAgentModelChange("primary", event.target.value)}
                  disabled={newAgent.isSaving}
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
                  value={newAgent.fallbackModelConfigId ?? ''}
                  onChange={event => handleNewAgentModelChange("fallback", event.target.value)}
                  disabled={newAgent.isSaving}
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
                <Label htmlFor="new-agent-system">System prompt</Label>
                <Textarea
                  id="new-agent-system"
                  value={newAgent.systemPrompt}
                  onChange={event => handleNewAgentPromptChange("system", event.target.value)}
                  rows={8}
                  disabled={newAgent.isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-agent-user">User prompt</Label>
                <Textarea
                  id="new-agent-user"
                  value={newAgent.userPrompt}
                  onChange={event => handleNewAgentPromptChange("user", event.target.value)}
                  rows={8}
                  disabled={newAgent.isSaving}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Variables actives</Label>
              <div className="flex flex-wrap gap-2">
                {sortedVariables.map(variable => {
                  const isActive = newAgent.availableVariables.includes(variable.key);
                  return (
                    <button
                      key={variable.key}
                      type="button"
                      onClick={() => handleNewAgentToggleVariable(variable.key)}
                      className={`px-3 py-1 text-sm rounded-full border transition ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted border-muted-foreground/20"
                      }`}
                      disabled={newAgent.isSaving}
                    >
                      {variable.key}
                    </button>
                  );
                })}
              </div>
            </div>

            {newAgent.error && (
              <p className="text-sm text-destructive">{newAgent.error}</p>
            )}
            {newAgent.successMessage && (
              <p className="text-sm text-emerald-600">{newAgent.successMessage}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCreateAgent} disabled={isCreateDisabled}>
                {newAgent.isSaving ? "Création en cours..." : "Créer l'agent"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleResetNewAgentForm}
                disabled={newAgent.isSaving}
              >
                Réinitialiser
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Variables disponibles</CardTitle>
          <CardDescription>
            Insérez ces variables dans vos prompts via la syntaxe {"{{variable}}"}.
          </CardDescription>
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
                          className={`px-3 py-1 text-sm rounded-full border transition ${
                            isActive
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted border-muted-foreground/20"
                          }`}
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
