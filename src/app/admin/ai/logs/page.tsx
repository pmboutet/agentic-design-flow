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

  const toggleLogExpansion = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
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
                                onClick={() => toggleLogExpansion(log.id)}
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

                              {isExpanded && (
                                <div className="border-t bg-slate-50 px-4 pb-4">
                                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                      <h4 className="mb-2 text-sm font-medium text-slate-700">Payload de requête</h4>
                                      <div className="overflow-x-auto rounded border border-slate-200">
                                        <JsonSyntaxHighlighter>
                                          {JSON.stringify(log.requestPayload, null, 2)}
                                        </JsonSyntaxHighlighter>
                                      </div>
                                    </div>

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
                              )}
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
