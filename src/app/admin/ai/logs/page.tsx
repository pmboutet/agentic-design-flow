"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { 
  RefreshCw, 
  Search, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiAgentLog } from "@/types";

// Import dynamique pour éviter les problèmes SSR
const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Prism),
  { ssr: false }
);

// Composant wrapper pour le style
function JsonSyntaxHighlighter({ children }: { children: string }) {
  const [style, setStyle] = useState<any>(null);

  useEffect(() => {
    import("react-syntax-highlighter/dist/esm/styles/prism").then((mod) => {
      setStyle(mod.vscDarkPlus);
    });

    // Injecter des styles CSS globaux pour forcer le retour à la ligne
    const styleId = "json-syntax-highlighter-wrap";
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement("style");
      styleElement.id = styleId;
      styleElement.textContent = `
        .json-highlighter-container pre,
        .json-highlighter-container code {
          white-space: pre-wrap !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          max-width: 100% !important;
        }
      `;
      document.head.appendChild(styleElement);
    }
  }, []);

  if (!style) {
    // Fallback pendant le chargement
    return (
      <pre
        className="whitespace-pre-wrap break-words rounded border bg-slate-900 p-3 text-xs text-white"
        style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
      >
        {children}
      </pre>
    );
  }

  return (
    <div className="json-highlighter-container">
      <SyntaxHighlighter
        language="json"
        style={style}
        customStyle={{
          margin: 0,
          padding: "12px",
          fontSize: "12px",
          lineHeight: "1.5",
          borderRadius: "0.375rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "break-word",
          maxWidth: "100%",
        }}
        wrapLines={true}
        wrapLongLines={true}
        codeTagProps={{
          style: {
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

/**
 * Extract variable values from merged prompt by comparing with template
 * Returns a map of variable name to its resolved value
 *
 * More robust approach: uses template segments between variables as anchors
 */
function extractVariableValues(template: string, merged: string): Record<string, string> {
  const variables: Record<string, string> = {};

  // Pattern to match simple {{variable}} (not block helpers like {{#if}}, {{/if}}, {{else}})
  const simpleVarPattern = /\{\{(?!#|\/|else)([^{}]+)\}\}/g;
  const matches = [...template.matchAll(simpleVarPattern)];

  if (matches.length === 0) return variables;

  // For each variable, find its value using more careful context matching
  for (const match of matches) {
    const varName = match[1].trim();
    const varStart = match.index!;
    const varEnd = varStart + match[0].length;

    // Find a unique "before" anchor - start with longer context
    let beforeContext = '';
    let beforeContextLen = 100;
    while (beforeContextLen >= 10) {
      const candidate = template.slice(Math.max(0, varStart - beforeContextLen), varStart);
      // Check if this context is unique enough (appears only once in template before this position)
      const occurrences = template.slice(0, varEnd).split(candidate).length - 1;
      if (occurrences === 1 && candidate.length > 0) {
        beforeContext = candidate;
        break;
      }
      beforeContextLen -= 20;
    }

    // Fallback to shorter context if needed
    if (!beforeContext) {
      beforeContext = template.slice(Math.max(0, varStart - 30), varStart);
    }

    // Find a unique "after" anchor
    let afterContext = '';
    let afterContextLen = 100;
    while (afterContextLen >= 10) {
      const candidate = template.slice(varEnd, Math.min(template.length, varEnd + afterContextLen));
      // Remove any Handlebars patterns from the beginning of after context for matching
      const cleanCandidate = candidate.replace(/^\{\{[^}]+\}\}/, '').slice(0, 50);
      if (cleanCandidate.length >= 5) {
        afterContext = cleanCandidate;
        break;
      }
      afterContextLen -= 20;
    }

    // Fallback
    if (!afterContext) {
      const rawAfter = template.slice(varEnd, Math.min(template.length, varEnd + 50));
      // Try to get text after any Handlebars block
      afterContext = rawAfter.replace(/^\{\{[^}]+\}\}/, '').slice(0, 30);
    }

    // Find the before context in merged string
    const beforeIdx = merged.indexOf(beforeContext);
    if (beforeIdx === -1) continue;

    const valueStart = beforeIdx + beforeContext.length;

    // Find the after context, starting from valueStart
    let valueEnd = -1;
    if (afterContext.length >= 3) {
      const afterIdx = merged.indexOf(afterContext, valueStart);
      if (afterIdx !== -1 && afterIdx > valueStart) {
        valueEnd = afterIdx;
      }
    }

    // If after context not found, try to find the next static text segment
    if (valueEnd === -1) {
      // Look for the next significant static text in the template after this variable
      const remainingTemplate = template.slice(varEnd);
      // Skip Handlebars blocks and find plain text
      const nextStaticMatch = remainingTemplate.match(/\}\}([^{]{10,})/);
      if (nextStaticMatch && nextStaticMatch[1]) {
        const nextStatic = nextStaticMatch[1].slice(0, 30).trim();
        if (nextStatic.length >= 5) {
          const staticIdx = merged.indexOf(nextStatic, valueStart);
          if (staticIdx !== -1 && staticIdx > valueStart) {
            valueEnd = staticIdx;
          }
        }
      }
    }

    // Still not found? Skip this variable to avoid grabbing too much
    if (valueEnd === -1 || valueEnd <= valueStart) {
      continue;
    }

    const value = merged.slice(valueStart, valueEnd);

    // Validate the extracted value
    if (value.length > 0 && value.length < 50000) {
      // Additional sanity check: value shouldn't contain obvious template markers
      if (!value.includes('{{') && !value.includes('}}')) {
        variables[varName] = value;
      } else {
        // If it contains markers, it might be partially correct - trim at first marker
        const markerIdx = value.indexOf('{{');
        if (markerIdx > 0) {
          variables[varName] = value.slice(0, markerIdx);
        }
      }
    }
  }

  return variables;
}

/**
 * Highlights variable values in the prompt text with colored spans
 * Similar to n8n style variable highlighting
 */
function HighlightedPrompt({
  text,
  template
}: {
  text: string;
  template?: string;
}) {
  // If no template, just show raw text
  if (!template) {
    return (
      <pre className="whitespace-pre-wrap break-words rounded border bg-slate-900 p-3 text-xs text-white">
        {text}
      </pre>
    );
  }

  // Extract variable values by comparing template and merged text
  const resolvedVariables = extractVariableValues(template, text);

  if (Object.keys(resolvedVariables).length === 0) {
    return (
      <pre className="whitespace-pre-wrap break-words rounded border bg-slate-900 p-3 text-xs text-white">
        {text}
      </pre>
    );
  }

  // Sort variables by value length (longest first) to avoid partial matches
  const sortedVars = Object.entries(resolvedVariables)
    .filter(([_, value]) => value && value.trim().length > 0)
    .sort((a, b) => b[1].length - a[1].length);

  if (sortedVars.length === 0) {
    return (
      <pre className="whitespace-pre-wrap break-words rounded border bg-slate-900 p-3 text-xs text-white">
        {text}
      </pre>
    );
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
    <pre className="whitespace-pre-wrap break-words rounded border bg-slate-900 p-3 text-xs text-white">
      {segments.map((segment, index) => {
        if (segment.isVariable) {
          return (
            <span
              key={index}
              className="bg-orange-500/30 text-orange-300 rounded px-0.5 border border-orange-500/50"
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

interface AgentTemplates {
  systemPrompt: string;
  userPrompt: string;
}

interface LogsResponse {
  success: boolean;
  data?: {
    logs: AiAgentLog[];
    total: number;
  };
  error?: string;
}

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200", 
  completed: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-800 border-red-200"
};

const statusIcons = {
  pending: Clock,
  processing: RefreshCw,
  completed: CheckCircle,
  failed: XCircle
};

export default function AiLogsPage() {
  const [logs, setLogs] = useState<AiAgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: "",
    interactionType: "",
    search: "",
    dateFrom: "",
    dateTo: ""
  });
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [agentTemplatesCache, setAgentTemplatesCache] = useState<Record<string, AgentTemplates | null>>({});
  const [loadingTemplates, setLoadingTemplates] = useState<Set<string>>(new Set());

  // Initialiser avec la date du jour par défaut
  useEffect(() => {
    setFilters(prev => {
      if (prev.dateFrom && prev.dateTo) {
        return prev; // Déjà initialisé
      }
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
      return {
        ...prev,
        dateFrom: startOfDay.toISOString(),
        dateTo: endOfDay.toISOString()
      };
    });
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append('limit', '200'); // Augmenter la limite pour voir plus de logs
      if (filters.status) params.append('status', filters.status);
      if (filters.interactionType) params.append('interactionType', filters.interactionType);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      
      const response = await fetch(`/api/admin/ai/logs?${params.toString()}`);
      const data: LogsResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch logs');
      }

      setLogs(data.data?.logs || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filters.status, filters.interactionType, filters.dateFrom, filters.dateTo]);

  const filteredLogs = logs.filter(log => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        log.interactionType.toLowerCase().includes(searchLower) ||
        log.agentId?.toLowerCase().includes(searchLower) ||
        log.askSessionId?.toLowerCase().includes(searchLower) ||
        log.errorMessage?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const fetchAgentTemplates = async (agentSlug: string): Promise<AgentTemplates | null> => {
    // Check cache first
    if (agentTemplatesCache[agentSlug] !== undefined) {
      return agentTemplatesCache[agentSlug];
    }

    // Mark as loading
    setLoadingTemplates(prev => new Set(prev).add(agentSlug));

    try {
      const response = await fetch(`/api/admin/ai/agents/${encodeURIComponent(agentSlug)}`);
      const data = await response.json();

      if (data.success && data.data) {
        const templates: AgentTemplates = {
          systemPrompt: data.data.systemPrompt || '',
          userPrompt: data.data.userPrompt || '',
        };
        setAgentTemplatesCache(prev => ({ ...prev, [agentSlug]: templates }));
        return templates;
      }

      // Cache null to avoid re-fetching
      setAgentTemplatesCache(prev => ({ ...prev, [agentSlug]: null }));
      return null;
    } catch (err) {
      console.error('Error fetching agent templates:', err);
      setAgentTemplatesCache(prev => ({ ...prev, [agentSlug]: null }));
      return null;
    } finally {
      setLoadingTemplates(prev => {
        const next = new Set(prev);
        next.delete(agentSlug);
        return next;
      });
    }
  };

  const toggleLogExpansion = async (logId: string, agentSlug?: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
      // Fetch agent templates if not already cached and agentSlug is provided
      if (agentSlug && agentTemplatesCache[agentSlug] === undefined) {
        fetchAgentTemplates(agentSlug);
      }
    }
    setExpandedLogs(newExpanded);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatLatency = (latencyMs: number | null) => {
    if (!latencyMs) return 'N/A';
    if (latencyMs < 1000) return `${latencyMs}ms`;
    return `${(latencyMs / 1000).toFixed(1)}s`;
  };

  const exportLogs = () => {
    const csvContent = [
      ['ID', 'Status', 'Type', 'Agent ID', 'Session ID', 'Latency', 'Created At', 'Error'].join(','),
      ...filteredLogs.map(log => [
        log.id,
        log.status,
        log.interactionType,
        log.agentId || '',
        log.askSessionId || '',
        log.latencyMs || '',
        log.createdAt,
        log.errorMessage || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">AI Logs</h1>
          <p className="text-sm text-slate-300">
            Surveillez et analysez les interactions avec les modèles IA
          </p>
        </div>

        <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/95 p-6 text-slate-900 shadow-xl backdrop-blur">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Filtres et actions</CardTitle>
                  <div className="flex gap-2">
                    <Button onClick={fetchLogs} disabled={loading} variant="outline" size="sm">
                      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      Actualiser
                    </Button>
                    <Button onClick={exportLogs} variant="outline" size="sm">
                      <Download className="mr-2 h-4 w-4" />
                      Exporter CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  <div>
                    <Label htmlFor="search">Recherche</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-slate-400" />
                      <Input
                        id="search"
                        placeholder="Rechercher dans les logs..."
                        value={filters.search}
                        onChange={event => setFilters(prev => ({ ...prev, search: event.target.value }))}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="status">Statut</Label>
                    <select
                      id="status"
                      value={filters.status}
                      onChange={event => setFilters(prev => ({ ...prev, status: event.target.value }))}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Tous les statuts</option>
                      <option value="pending">En attente</option>
                      <option value="processing">En cours</option>
                      <option value="completed">Terminé</option>
                      <option value="failed">Échoué</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="interactionType">Type d'interaction</Label>
                    <select
                      id="interactionType"
                      value={filters.interactionType}
                      onChange={event => setFilters(prev => ({ ...prev, interactionType: event.target.value }))}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Tous les types</option>
                      <optgroup label="Chat & Conversations">
                        <option value="ask.chat.response">Réponse Chat</option>
                        <option value="ask.chat.response.streaming">Réponse Chat Streaming</option>
                      </optgroup>
                      <optgroup label="Insights">
                        <option value="ask.insight.detection">Détection d'Insights</option>
                        <option value="insight.synthesis">Synthèse d'Insights</option>
                        <option value="insight.entity.extraction">Extraction d'Entités</option>
                      </optgroup>
                      <optgroup label="Défis & Questions">
                        <option value="challenge.ask.generator">Générateur de Questions</option>
                      </optgroup>
                      <optgroup label="Gestion de Défis (Challenge Builder)">
                        <option value="project_challenge_planning">Planification de Révision</option>
                        <option value="project_challenge_update_detailed">Mise à Jour Détaillée</option>
                        <option value="project_challenge_creation_detailed">Création Détaillée</option>
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="dateFrom">Date début</Label>
                    <Input
                      id="dateFrom"
                      type="datetime-local"
                      value={filters.dateFrom ? new Date(filters.dateFrom).toISOString().slice(0, 16) : ""}
                      onChange={event => {
                        const date = event.target.value ? new Date(event.target.value).toISOString() : "";
                        setFilters(prev => ({ ...prev, dateFrom: date }));
                      }}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="dateTo">Date fin</Label>
                    <Input
                      id="dateTo"
                      type="datetime-local"
                      value={filters.dateTo ? new Date(filters.dateTo).toISOString().slice(0, 16) : ""}
                      onChange={event => {
                        const date = event.target.value ? new Date(event.target.value).toISOString() : "";
                        setFilters(prev => ({ ...prev, dateTo: date }));
                      }}
                      className="w-full"
                    />
                  </div>

                  <div className="flex items-end gap-2 md:col-span-2 lg:col-span-1">
                    <Button
                      onClick={() => {
                        const today = new Date();
                        const startOfDay = new Date(today);
                        startOfDay.setHours(0, 0, 0, 0);
                        const endOfDay = new Date(today);
                        endOfDay.setHours(23, 59, 59, 999);
                        setFilters(prev => ({ ...prev, dateFrom: startOfDay.toISOString(), dateTo: endOfDay.toISOString() }));
                      }}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      Aujourd'hui
                    </Button>
                    <Button
                      onClick={() => setFilters({ status: "", interactionType: "", search: "", dateFrom: "", dateTo: "" })}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      Effacer
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card className="bg-slate-50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Total</p>
                      <p className="text-2xl font-bold">{logs.length}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-emerald-50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-emerald-700">Terminés</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        {logs.filter(log => log.status === "completed").length}
                      </p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-emerald-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-blue-50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700">En cours</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {logs.filter(log => log.status === "processing").length}
                      </p>
                    </div>
                    <RefreshCw className="h-8 w-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-red-50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-red-700">Échoués</p>
                      <p className="text-2xl font-bold text-red-600">
                        {logs.filter(log => log.status === "failed").length}
                      </p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Logs d'interactions IA</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="mr-2 h-6 w-6 animate-spin" />
                    <span>Chargement des logs...</span>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center py-8 text-red-600">
                    <XCircle className="mr-2 h-6 w-6" />
                    <span>{error}</span>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-slate-500">
                    <AlertCircle className="mr-2 h-6 w-6" />
                    <span>Aucun log trouvé</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence>
                      {filteredLogs.map(log => {
                        const StatusIcon = statusIcons[log.status as keyof typeof statusIcons];
                        const isExpanded = expandedLogs.has(log.id);

                        return (
                          <motion.div
                            key={log.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Card className="border-l-4 border-l-slate-200 transition-colors hover:border-l-slate-300">
                              <CardContent
                                className="cursor-pointer p-4 transition-colors hover:bg-slate-50"
                                onClick={() => {
                                  const payload = log.requestPayload as Record<string, unknown>;
                                  const agentSlug = typeof payload.agentSlug === 'string' ? payload.agentSlug : undefined;
                                  toggleLogExpansion(log.id, agentSlug);
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <StatusIcon className="h-5 w-5 text-slate-600" />
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[log.status as keyof typeof statusColors]}`}>
                                          {log.status}
                                        </span>
                                        <span className="font-medium">{log.interactionType}</span>
                                      </div>
                                      <p className="text-sm text-slate-600">
                                        {log.agentId && `Agent: ${log.agentId}`}
                                        {log.askSessionId && ` • Session: ${log.askSessionId.slice(0, 8)}...`}
                                        {log.latencyMs && ` • Latence: ${formatLatency(log.latencyMs)}`}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-500">{formatTimestamp(log.createdAt)}</span>
                                    {isExpanded ? (
                                      <span className="text-slate-400">▲</span>
                                    ) : (
                                      <span className="text-slate-400">▼</span>
                                    )}
                                  </div>
                                </div>

                                {log.errorMessage && (
                                  <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                                    <strong>Erreur :</strong> {log.errorMessage}
                                  </div>
                                )}
                              </CardContent>

                              {isExpanded && (() => {
                                const payload = log.requestPayload as Record<string, unknown>;
                                const systemPrompt = typeof payload.systemPrompt === 'string' ? payload.systemPrompt : null;
                                const userPrompt = typeof payload.userPrompt === 'string' ? payload.userPrompt : null;
                                const agentSlug = typeof payload.agentSlug === 'string' ? payload.agentSlug : undefined;

                                // Get templates: prefer stored templates, fallback to fetched from agent
                                const storedSystemTemplate = typeof payload.systemPromptTemplate === 'string' ? payload.systemPromptTemplate : undefined;
                                const storedUserTemplate = typeof payload.userPromptTemplate === 'string' ? payload.userPromptTemplate : undefined;

                                // Use cached agent templates if stored ones are not available
                                const cachedTemplates = agentSlug ? agentTemplatesCache[agentSlug] : null;
                                const systemPromptTemplate = storedSystemTemplate || cachedTemplates?.systemPrompt;
                                const userPromptTemplate = storedUserTemplate || cachedTemplates?.userPrompt;
                                const isLoadingTemplates = agentSlug ? loadingTemplates.has(agentSlug) : false;

                                // Create a payload without the prompts for the JSON display
                                const { systemPrompt: _sp, userPrompt: _up, systemPromptTemplate: _spt, userPromptTemplate: _upt, ...otherPayload } = payload;

                                return (
                                  <div className="border-t bg-slate-50 px-4 pb-4">
                                    <div className="mt-4 space-y-4">
                                      {/* System Prompt with highlighting */}
                                      {systemPrompt && (
                                        <div>
                                          <h4 className="mb-2 text-sm font-medium text-slate-700">
                                            System Prompt
                                            {isLoadingTemplates && (
                                              <span className="ml-2 text-xs font-normal text-blue-600">
                                                (chargement des templates...)
                                              </span>
                                            )}
                                            {!isLoadingTemplates && systemPromptTemplate && (
                                              <span className="ml-2 text-xs font-normal text-orange-600">
                                                (variables colorées)
                                              </span>
                                            )}
                                          </h4>
                                          <div className="overflow-x-auto rounded border border-slate-200">
                                            <HighlightedPrompt
                                              text={systemPrompt}
                                              template={systemPromptTemplate}
                                            />
                                          </div>
                                        </div>
                                      )}

                                      {/* User Prompt with highlighting */}
                                      {userPrompt && (
                                        <div>
                                          <h4 className="mb-2 text-sm font-medium text-slate-700">
                                            User Prompt
                                            {isLoadingTemplates && (
                                              <span className="ml-2 text-xs font-normal text-blue-600">
                                                (chargement des templates...)
                                              </span>
                                            )}
                                            {!isLoadingTemplates && userPromptTemplate && (
                                              <span className="ml-2 text-xs font-normal text-orange-600">
                                                (variables colorées)
                                              </span>
                                            )}
                                          </h4>
                                          <div className="overflow-x-auto rounded border border-slate-200">
                                            <HighlightedPrompt
                                              text={userPrompt}
                                              template={userPromptTemplate}
                                            />
                                          </div>
                                        </div>
                                      )}

                                      {/* Other payload data */}
                                      {Object.keys(otherPayload).length > 0 && (
                                        <div>
                                          <h4 className="mb-2 text-sm font-medium text-slate-700">Autres données</h4>
                                          <div className="overflow-x-auto rounded border border-slate-200">
                                            <JsonSyntaxHighlighter>
                                              {JSON.stringify(otherPayload, null, 2)}
                                            </JsonSyntaxHighlighter>
                                          </div>
                                        </div>
                                      )}

                                      {/* Response payload */}
                                      {log.responsePayload && (
                                        <div>
                                          <h4 className="mb-2 text-sm font-medium text-slate-700">Payload de réponse</h4>
                                          <div className="overflow-x-auto rounded border border-slate-200">
                                            <JsonSyntaxHighlighter>
                                              {JSON.stringify(log.responsePayload, null, 2)}
                                            </JsonSyntaxHighlighter>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </Card>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
  );
}
