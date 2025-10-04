"use client";

import React, { useState, useEffect } from "react";
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
    search: ""
  });
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.interactionType) params.append('interactionType', filters.interactionType);
      
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
  }, [filters.status, filters.interactionType]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">AI Logs</h1>
          <p className="text-slate-600">Surveillez et analysez les interactions avec les modèles IA</p>
        </div>

        {/* Controls */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Filtres et Actions</CardTitle>
              <div className="flex gap-2">
                <Button onClick={fetchLogs} disabled={loading} variant="outline" size="sm">
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Actualiser
                </Button>
                <Button onClick={exportLogs} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Exporter CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="search">Recherche</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="search"
                    placeholder="Rechercher dans les logs..."
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="status">Statut</Label>
                <select 
                  id="status"
                  value={filters.status} 
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full p-2 border rounded-md"
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
                  onChange={(e) => setFilters(prev => ({ ...prev, interactionType: e.target.value }))}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Tous les types</option>
                  <option value="ask.chat.response">Réponse Chat</option>
                  <option value="ask.chat.response.streaming">Réponse Chat Streaming</option>
                  <option value="ask.insight.generation">Génération d'Insights</option>
                  <option value="challenge.creation">Création de Défi</option>
                </select>
              </div>

              <div className="flex items-end">
                <Button 
                  onClick={() => setFilters({ status: "", interactionType: "", search: "" })}
                  variant="outline"
                  className="w-full"
                >
                  Effacer les filtres
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
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
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Terminés</p>
                  <p className="text-2xl font-bold text-green-600">
                    {logs.filter(log => log.status === 'completed').length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">En cours</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {logs.filter(log => log.status === 'processing').length}
                  </p>
                </div>
                <RefreshCw className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Échoués</p>
                  <p className="text-2xl font-bold text-red-600">
                    {logs.filter(log => log.status === 'failed').length}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Logs List */}
        <Card>
          <CardHeader>
            <CardTitle>Logs d'Interactions IA</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                <span>Chargement des logs...</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-8 text-red-600">
                <XCircle className="h-6 w-6 mr-2" />
                <span>{error}</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <AlertCircle className="h-6 w-6 mr-2" />
                <span>Aucun log trouvé</span>
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence>
                  {filteredLogs.map((log) => {
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
                        <Card className="border-l-4 border-l-slate-200 hover:border-l-slate-300 transition-colors">
                          <CardContent 
                            className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => toggleLogExpansion(log.id)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <StatusIcon className="h-5 w-5 text-slate-600" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[log.status as keyof typeof statusColors]}`}>
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
                                <span className="text-sm text-slate-500">
                                  {formatTimestamp(log.createdAt)}
                                </span>
                                {isExpanded ? (
                                  <span className="text-slate-400">▲</span>
                                ) : (
                                  <span className="text-slate-400">▼</span>
                                )}
                              </div>
                            </div>
                            
                            {log.errorMessage && (
                              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                <strong>Erreur:</strong> {log.errorMessage}
                              </div>
                            )}
                          </CardContent>
                          
                          {isExpanded && (
                            <div className="px-4 pb-4 border-t bg-slate-50">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div>
                                  <h4 className="font-medium text-sm text-slate-700 mb-2">Payload de requête</h4>
                                  <pre className="bg-white p-3 rounded border text-xs overflow-x-auto">
                                    {JSON.stringify(log.requestPayload, null, 2)}
                                  </pre>
                                </div>
                                
                                {log.responsePayload && (
                                  <div>
                                    <h4 className="font-medium text-sm text-slate-700 mb-2">Payload de réponse</h4>
                                    <pre className="bg-white p-3 rounded border text-xs overflow-x-auto">
                                      {JSON.stringify(log.responsePayload, null, 2)}
                                    </pre>
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
  );
}