"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AiAgentLog } from "@/types";

interface LogsResponse {
  success: boolean;
  data?: AiAgentLog[];
  error?: string;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export default function AiLogsPage() {
  const [logs, setLogs] = useState<AiAgentLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ai/logs?limit=100");
      const json: LogsResponse = await response.json();

      if (!json.success) {
        throw new Error(json.error || "Impossible de récupérer les logs");
      }

      setLogs(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue lors du chargement");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Historique des requêtes IA</h1>
          <p className="text-muted-foreground">Visualisez les appels envoyés aux modèles et leurs réponses.</p>
        </div>
        <Button onClick={loadLogs} disabled={isLoading}>
          Rafraîchir
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive text-base">Erreur</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {isLoading && logs.length === 0 ? (
          <p className="text-muted-foreground">Chargement des logs...</p>
        ) : logs.length === 0 ? (
          <p className="text-muted-foreground">Aucun log récent.</p>
        ) : (
          logs.map(log => (
            <Card key={log.id} className="border-muted/60">
              <CardHeader className="flex flex-col gap-1">
                <CardTitle className="text-base font-semibold">
                  {log.interactionType}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Agent ID: {log.agentId ?? "n/a"} · Modèle: {log.modelConfigId ?? "n/a"}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-1 md:grid-cols-2">
                  <p><span className="font-medium">Session:</span> {log.askSessionId ?? "-"}</p>
                  <p><span className="font-medium">Message:</span> {log.messageId ?? "-"}</p>
                  <p><span className="font-medium">Statut:</span> {log.status}</p>
                  <p><span className="font-medium">Durée:</span> {log.latencyMs ? `${log.latencyMs} ms` : "-"}</p>
                  <p><span className="font-medium">Créé le:</span> {formatDate(log.createdAt)}</p>
                </div>

                <details className="rounded border bg-muted/40 p-3">
                  <summary className="cursor-pointer font-medium">Payload envoyé</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs">
                    {JSON.stringify(log.requestPayload, null, 2)}
                  </pre>
                </details>

                {log.responsePayload && (
                  <details className="rounded border bg-muted/40 p-3">
                    <summary className="cursor-pointer font-medium">Réponse</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-xs">
                      {JSON.stringify(log.responsePayload, null, 2)}
                    </pre>
                  </details>
                )}

                {log.errorMessage && (
                  <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                    {log.errorMessage}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
