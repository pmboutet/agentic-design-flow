"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Network, Sparkles, ChevronDown, ChevronUp, TestTube2 } from "lucide-react";
import type { AiAgentRecord, AiModelConfig, PromptVariableDefinition, ApiResponse } from "@/types";
import { extractTemplateVariables } from "@/lib/ai/templates";
import { AgentTestMode } from "@/components/admin/AgentTestMode";

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

// Auto-resize textarea component
const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ value, onChange, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const combinedRef = (node: HTMLTextAreaElement | null) => {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
      textareaRef.current = node;
    };

    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    }, [value]);

    // Also resize on mount
    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    }, []);

    return (
      <Textarea
        ref={combinedRef}
        value={value}
        onChange={onChange}
        {...props}
        style={{ overflow: "hidden", resize: "none", ...props.style }}
      />
    );
  }
);
AutoResizeTextarea.displayName = "AutoResizeTextarea";

// Group agents by category
type AgentGroup = {
  key: string;
  title: string;
  description: string;
  agents: AgentDraft[];
  color: {
    border: string;
    bg: string;
    text: string;
    badge: string;
  };
};

// Define color scheme for each group
const groupColors: Record<string, AgentGroup["color"]> = {
  conversation: {
    border: "border-blue-400/40",
    bg: "bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-200",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  "insight-detection": {
    border: "border-purple-400/40",
    bg: "bg-purple-500/10",
    text: "text-purple-700 dark:text-purple-200",
    badge: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  "ask-generator": {
    border: "border-emerald-400/40",
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-200",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
  "challenge-builder": {
    border: "border-indigo-400/40",
    bg: "bg-indigo-500/10",
    text: "text-indigo-700 dark:text-indigo-200",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  },
  other: {
    border: "border-gray-400/40",
    bg: "bg-gray-500/10",
    text: "text-gray-700 dark:text-gray-200",
    badge: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  },
};

function groupAgents(agents: AgentDraft[]): AgentGroup[] {
  const groups: AgentGroup[] = [
    {
      key: "conversation",
      title: "Conversation",
      description: "Agents de conversation et de réponse dans les sessions ASK",
      agents: [],
      color: groupColors.conversation,
    },
    {
      key: "insight-detection",
      title: "Détection d'Insights",
      description: "Agents de détection et d'analyse d'insights dans les conversations",
      agents: [],
      color: groupColors["insight-detection"],
    },
    {
      key: "ask-generator",
      title: "Générateur de Sessions ASK",
      description: "Agents de génération de nouvelles sessions ASK",
      agents: [],
      color: groupColors["ask-generator"],
    },
    {
      key: "challenge-builder",
      title: "Constructeur de Challenges",
      description: "Agents de construction et de révision de challenges",
      agents: [],
      color: groupColors["challenge-builder"],
    },
    {
      key: "other",
      title: "Autres Agents",
      description: "Autres agents du système",
      agents: [],
      color: groupColors.other,
    },
  ];

  agents.forEach(agent => {
    const slug = agent.slug.toLowerCase();
    if (slug.includes("conversation") || slug.includes("chat")) {
      groups[0].agents.push(agent);
    } else if (slug.includes("insight-detection") || slug.includes("insight") || slug.includes("detection")) {
      groups[1].agents.push(agent);
    } else if (slug.includes("ask-generator") || slug.includes("generator")) {
      groups[2].agents.push(agent);
    } else if (slug.includes("challenge") || slug.includes("builder")) {
      groups[3].agents.push(agent);
    } else {
      groups[4].agents.push(agent);
    }
  });

  // Filter out empty groups
  return groups.filter(group => group.agents.length > 0);
}

// Filter variables by agent type
function getVariablesForAgent(
  agentSlug: string,
  allVariables: PromptVariableDefinition[]
): PromptVariableDefinition[] {
  const slug = agentSlug.toLowerCase();
  
  // Variables pour agents ASK/conversation
  const askVariables = [
    "ask_key",
    "ask_question",
    "ask_description",
    "message_history",
    "latest_user_message",
    "latest_ai_response",
    "participant_name",
    "participants",
    "existing_insights_json",
    "system_prompt_ask",
    "system_prompt_challenge",
    "system_prompt_project",
  ];

  // Variables pour agents challenge-builder et ask-generator
  const challengeVariables = [
    "project_name",
    "project_goal",
    "project_status",
    "challenge_id",
    "challenge_title",
    "challenge_description",
    "challenge_status",
    "challenge_impact",
    "challenge_context_json",
    "insights_json",
    "existing_asks_json",
    "system_prompt_project",
    "system_prompt_challenge",
  ];

  if (slug.includes("conversation") || slug.includes("chat") || slug.includes("ask-conversation")) {
    return allVariables.filter(v => askVariables.includes(v.key));
  }
  
  if (slug.includes("challenge") || slug.includes("builder")) {
    return allVariables.filter(v => challengeVariables.includes(v.key));
  }
  
  if (slug.includes("ask-generator") || slug.includes("generator")) {
    return allVariables.filter(v => challengeVariables.includes(v.key));
  }

  if (slug.includes("insight-detection") || slug.includes("insight")) {
    // Variables pour détection d'insights
    return allVariables.filter(v => 
      askVariables.includes(v.key) || 
      v.key === "existing_insights_json" ||
      v.key === "insight_types"
    );
  }

  // Par défaut, toutes les variables
  return allVariables;
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [testModeAgentId, setTestModeAgentId] = useState<string | null>(null);
  
  // Graph RAG state
  const [graphStats, setGraphStats] = useState<{
    totalInsights: number;
    insightsWithEmbeddings: number;
    insightsWithEntities: number;
    graphEdges: number;
  } | null>(null);
  const [isLoadingGraphStats, setIsLoadingGraphStats] = useState(false);
  const [isBuildingGraph, setIsBuildingGraph] = useState(false);
  const [graphBuildResult, setGraphBuildResult] = useState<string | null>(null);
  const [graphBuildError, setGraphBuildError] = useState<string | null>(null);

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
    loadGraphStats();
  }, []);

  const loadGraphStats = async () => {
    setIsLoadingGraphStats(true);
    try {
      const response = await fetch("/api/admin/graph/build", { credentials: "include" });
      const data: ApiResponse<{
        totalInsights: number;
        insightsWithEmbeddings: number;
        insightsWithEntities: number;
        graphEdges: number;
      }> = await response.json();

      if (data.success && data.data) {
        setGraphStats(data.data);
      }
    } catch (err) {
      console.error("Error loading graph stats:", err);
    } finally {
      setIsLoadingGraphStats(false);
    }
  };

  const handleBuildGraph = async () => {
    setIsBuildingGraph(true);
    setGraphBuildResult(null);
    setGraphBuildError(null);

    try {
      const response = await fetch("/api/admin/graph/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          limit: 100,
          skipExisting: false, // Process all insights, even if they have embeddings
        }),
      });

      const data: ApiResponse<{
        processed: number;
        skipped: number;
        errors: number;
        total: number;
        message: string;
      }> = await response.json();

      if (data.success && data.data) {
        setGraphBuildResult(
          `Traité ${data.data.processed} insights, ${data.data.errors} erreurs. ${data.data.message}`
        );
        // Reload stats
        await loadGraphStats();
      } else {
        setGraphBuildError(data.error || "Erreur lors de la construction du graphe");
      }
    } catch (err) {
      setGraphBuildError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setIsBuildingGraph(false);
    }
  };

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
    setNewAgent(prev => {
      const newSystemPrompt = field === "system" ? value : prev.systemPrompt;
      const newUserPrompt = field === "user" ? value : prev.userPrompt;
      
      // Auto-sync variables from prompts
      const systemVars = extractTemplateVariables(newSystemPrompt);
      const userVars = extractTemplateVariables(newUserPrompt);
      const allDetectedVars = new Set([...systemVars, ...userVars]);
      const merged = new Set([...prev.availableVariables, ...allDetectedVars]);
      const syncedVariables = Array.from(merged);
      
      return {
        ...prev,
        systemPrompt: newSystemPrompt,
        userPrompt: newUserPrompt,
        availableVariables: syncedVariables,
        error: null,
        successMessage: null,
      };
    });
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

  // Function to synchronize variables from prompts
  const syncVariablesFromPrompts = (systemPrompt: string, userPrompt: string, existingVariables: string[]): string[] => {
    const systemVars = extractTemplateVariables(systemPrompt);
    const userVars = extractTemplateVariables(userPrompt);
    const allDetectedVars = new Set([...systemVars, ...userVars]);
    
    // Merge with existing variables, avoiding duplicates
    const merged = new Set([...existingVariables, ...allDetectedVars]);
    return Array.from(merged);
  };

  const handlePromptChange = (agentId: string, field: "system" | "user", value: string) => {
    setAgents(prev => prev.map(agent => {
      if (agent.id !== agentId) {
        return agent;
      }
      const newSystemPrompt = field === "system" ? value : agent.systemPromptDraft;
      const newUserPrompt = field === "user" ? value : agent.userPromptDraft;
      
      // Auto-sync variables from prompts
      const syncedVariables = syncVariablesFromPrompts(
        newSystemPrompt,
        newUserPrompt,
        agent.availableVariablesDraft
      );
      
      if (field === "system") {
        return { ...agent, systemPromptDraft: value, availableVariablesDraft: syncedVariables, saveSuccess: false };
      }
      return { ...agent, userPromptDraft: value, availableVariablesDraft: syncedVariables, saveSuccess: false };
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

  const groupedAgents = useMemo(() => {
    return groupAgents(agents);
  }, [agents]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

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
              <AutoResizeTextarea
                id="new-agent-description"
                value={newAgent.description}
                onChange={event => handleNewAgentDescriptionChange(event.target.value)}
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
                <AutoResizeTextarea
                  id="new-agent-system"
                  value={newAgent.systemPrompt}
                  onChange={event => handleNewAgentPromptChange("system", event.target.value)}
                  disabled={newAgent.isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-agent-user">User prompt</Label>
                <AutoResizeTextarea
                  id="new-agent-user"
                  value={newAgent.userPrompt}
                  onChange={event => handleNewAgentPromptChange("user", event.target.value)}
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

      {/* Graph RAG Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            <CardTitle>Graph RAG - Construction du graphe</CardTitle>
          </div>
          <CardDescription>
            Construire le graphe de connaissances pour les insights existants (embeddings, entités, relations).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingGraphStats ? (
            <p className="text-sm text-muted-foreground">Chargement des statistiques...</p>
          ) : graphStats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">Total insights</p>
                <p className="text-lg font-semibold">{graphStats.totalInsights}</p>
              </div>
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">Avec embeddings</p>
                <p className="text-lg font-semibold">{graphStats.insightsWithEmbeddings}</p>
              </div>
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">Avec entités</p>
                <p className="text-lg font-semibold">{graphStats.insightsWithEntities}</p>
              </div>
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">Arêtes du graphe</p>
                <p className="text-lg font-semibold">{graphStats.graphEdges}</p>
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              onClick={handleBuildGraph}
              disabled={isBuildingGraph}
              className="gap-2"
            >
              {isBuildingGraph ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Construction en cours...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Construire le graphe
                </>
              )}
            </Button>
            <Button
              onClick={loadGraphStats}
              variant="outline"
              disabled={isLoadingGraphStats}
              className="gap-2"
            >
              {isLoadingGraphStats ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Actualiser"
              )}
            </Button>
          </div>

          {graphBuildResult && (
            <p className="text-sm text-emerald-600">{graphBuildResult}</p>
          )}
          {graphBuildError && (
            <p className="text-sm text-destructive">{graphBuildError}</p>
          )}

          <div className="rounded-lg border p-4 bg-muted/20">
            <p className="text-xs text-muted-foreground">
              <strong>Note :</strong> Cette opération traite les insights sans embeddings par lots de 100.
              Pour chaque insight, elle génère les embeddings, extrait les entités (mots-clés, concepts, thèmes),
              et construit les arêtes du graphe (similarités, relations conceptuelles, liens aux challenges).
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {isLoading && agents.length === 0 ? (
          <p className="text-muted-foreground">Chargement des agents...</p>
        ) : agents.length === 0 ? (
          <p className="text-muted-foreground">Aucun agent configuré pour le moment.</p>
        ) : (
          groupedAgents.map(group => {
            const isCollapsed = collapsedGroups.has(group.key);
            return (
              <Card key={group.key} className={`${group.color.border} ${group.color.bg} border`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className={`flex items-center gap-3 ${group.color.text}`}>
                        {group.title}
                        <span className="text-sm font-normal opacity-70">
                          ({group.agents.length})
                        </span>
                      </CardTitle>
                      <CardDescription className="mt-1">{group.description}</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleGroup(group.key)}
                      className="shrink-0"
                    >
                      {isCollapsed ? (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Développer
                        </>
                      ) : (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Réduire
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                {!isCollapsed && (
                  <CardContent className="space-y-6">
                    {group.agents.map(agent => (
                      <Card key={agent.id} className="border-muted bg-card">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <CardTitle className="text-lg">{agent.name}</CardTitle>
                              {agent.description && (
                                <CardDescription className="mt-1">{agent.description}</CardDescription>
                              )}
                            </div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${group.color.badge} border`}>
                              {agent.slug}
                            </span>
                          </div>
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
                              <AutoResizeTextarea
                                id={`system-${agent.id}`}
                                value={agent.systemPromptDraft}
                                onChange={event => handlePromptChange(agent.id, "system", event.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`user-${agent.id}`}>User prompt</Label>
                              <AutoResizeTextarea
                                id={`user-${agent.id}`}
                                value={agent.userPromptDraft}
                                onChange={event => handlePromptChange(agent.id, "user", event.target.value)}
                              />
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label>Variables actives</Label>
                            <div className="flex flex-wrap gap-2">
                              {(() => {
                                const agentVariables = getVariablesForAgent(agent.slug, sortedVariables);
                                return agentVariables.map(variable => {
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
                                });
                              })()}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label>Variables disponibles</Label>
                            <CardDescription className="text-xs mb-2">
                              Variables pertinentes pour cet agent. Insérez-les dans vos prompts via la syntaxe {"{{variable}}"}.
                            </CardDescription>
                            <div className="grid gap-3 md:grid-cols-2">
                              {(() => {
                                const agentVariables = getVariablesForAgent(agent.slug, sortedVariables);
                                return agentVariables.map(variable => (
                                  <div key={variable.key} className="rounded-lg border p-3 bg-muted/30">
                                    <p className="font-semibold text-sm">{variable.key}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{variable.description}</p>
                                    {variable.example && (
                                      <p className="text-xs text-muted-foreground mt-1">Exemple : {variable.example}</p>
                                    )}
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>

                          {agent.saveError && (
                            <p className="text-sm text-destructive">{agent.saveError}</p>
                          )}
                          {agent.saveSuccess && (
                            <p className="text-sm text-emerald-600">Modifications enregistrées.</p>
                          )}

                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleSaveAgent(agent.id)}
                              disabled={agent.isSaving}
                            >
                              {agent.isSaving ? 'Enregistrement...' : 'Enregistrer'}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setTestModeAgentId(agent.id === testModeAgentId ? null : agent.id)}
                            >
                              <TestTube2 className="h-4 w-4 mr-2" />
                              {testModeAgentId === agent.id ? 'Masquer' : 'Mode test'}
                            </Button>
                          </div>

                          {testModeAgentId === agent.id && (
                            <AgentTestMode
                              agentId={agent.id}
                              agentSlug={agent.slug}
                              onClose={() => setTestModeAgentId(null)}
                            />
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
      </div>
  );
}
