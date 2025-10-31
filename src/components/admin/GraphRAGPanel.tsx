"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Sparkles, Network, TrendingUp, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResponse } from "@/types";

interface Synthesis {
  id: string;
  synthesized_text: string;
  source_insight_ids: string[];
  key_concepts: string[];
  created_at: string;
}

interface InsightCluster {
  id: string;
  insightIds: string[];
  size: number;
  averageSimilarity: number;
}

interface RelatedInsight {
  id: string;
  path: string[];
  relationshipTypes: string[];
  similarityScore?: number;
}

interface GraphRAGPanelProps {
  projectId?: string | null;
}

export function GraphRAGPanel({ projectId }: GraphRAGPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"semantic" | "keyword" | "graph">("semantic");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; type: string; score?: number; method: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [syntheses, setSyntheses] = useState<Synthesis[]>([]);
  const [clusters, setClusters] = useState<InsightCluster[]>([]);
  const [relatedInsights, setRelatedInsights] = useState<RelatedInsight[]>([]);
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);
  const [isLoadingSyntheses, setIsLoadingSyntheses] = useState(false);
  const [isGeneratingSyntheses, setIsGeneratingSyntheses] = useState(false);
  const [isLoadingClusters, setIsLoadingClusters] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load syntheses for the project
  const loadSyntheses = useCallback(async () => {
    if (!projectId) return;

    setIsLoadingSyntheses(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/graph/synthesis/${projectId}`);
      const data: ApiResponse<Synthesis[]> = await response.json();

      if (data.success && data.data) {
        setSyntheses(data.data);
      } else {
        setError(data.error || "Failed to load syntheses");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load syntheses");
    } finally {
      setIsLoadingSyntheses(false);
    }
  }, [projectId]);

  // Load clusters
  const loadClusters = useCallback(async () => {
    if (!projectId) return;

    setIsLoadingClusters(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/graph/clusters/${projectId}?minSize=3`);
      const data: ApiResponse<InsightCluster[]> = await response.json();

      if (data.success && data.data) {
        setClusters(data.data);
      }
    } catch (err) {
      console.log("Error loading clusters:", err);
      // Non-blocking error
    } finally {
      setIsLoadingClusters(false);
    }
  }, [projectId]);

  // Load related insights for selected insight
  const loadRelatedInsights = useCallback(async (insightId: string) => {
    try {
      const response = await fetch(
        `/api/admin/graph/insights/${insightId}/related?depth=2&types=SIMILAR_TO,RELATED_TO`
      );
      const data: ApiResponse<RelatedInsight[]> = await response.json();

      if (data.success && data.data) {
        setRelatedInsights(data.data);
      }
    } catch (err) {
      console.error("Error loading related insights:", err);
    }
  }, []);

  // Search in graph
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/graph/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          searchType,
          projectId: projectId || undefined,
          limit: 20,
          threshold: 0.75,
        }),
      });

      const data: ApiResponse<Array<{ id: string; type: string; score?: number; method: string }>> =
        await response.json();

      if (data.success && data.data) {
        setSearchResults(data.data);
      } else {
        setError(data.error || "Search failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchType, projectId]);

  // Generate syntheses
  const handleGenerateSyntheses = useCallback(async () => {
    if (!projectId) return;

    setIsGeneratingSyntheses(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/graph/synthesis/${projectId}`, {
        method: "POST",
      });

      const data: ApiResponse<Synthesis[]> = await response.json();

      if (data.success && data.data) {
        setSyntheses(data.data);
      } else {
        setError(data.error || "Failed to generate syntheses");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate syntheses");
    } finally {
      setIsGeneratingSyntheses(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadSyntheses();
      loadClusters();
    }
  }, [projectId, loadSyntheses, loadClusters]);

  useEffect(() => {
    if (selectedInsightId) {
      loadRelatedInsights(selectedInsightId);
    }
  }, [selectedInsightId, loadRelatedInsights]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold">Graph RAG</h2>
        </div>
      </div>

      {/* Search Section */}
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Recherche dans le graphe</h3>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Rechercher par concept, mot-clé ou texte..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            className="flex-1"
          />
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value as "semantic" | "keyword" | "graph")}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="semantic">Sémantique</option>
            <option value="keyword">Mots-clés</option>
            <option value="graph">Graphe</option>
          </select>
          <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {searchResults.length} résultat(s) trouvé(s)
            </p>
            <div className="space-y-2">
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  className="rounded-md border bg-card p-3 text-sm hover:bg-accent cursor-pointer"
                  onClick={() => {
                    if (result.type === "insight") {
                      setSelectedInsightId(result.id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Insight {result.id.substring(0, 8)}</span>
                    <div className="flex items-center gap-2">
                      {result.score && (
                        <span className="text-xs text-muted-foreground">
                          {(result.score * 100).toFixed(0)}% similaire
                        </span>
                      )}
                      <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">
                        {result.method}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Syntheses Section */}
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">Synthèses d'insights</h3>
          </div>
          {projectId && (
            <Button
              onClick={handleGenerateSyntheses}
              disabled={isGeneratingSyntheses}
              size="sm"
              variant="outline"
            >
              {isGeneratingSyntheses ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Générer
            </Button>
          )}
        </div>

        {isLoadingSyntheses ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : syntheses.length > 0 ? (
          <div className="space-y-4">
            {syntheses.map((synthesis) => (
              <div key={synthesis.id} className="rounded-md border bg-background p-4">
                <p className="text-sm leading-relaxed">{synthesis.synthesized_text}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{synthesis.source_insight_ids.length} insights source</span>
                  <span>
                    {new Date(synthesis.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {projectId
              ? "Aucune synthèse disponible. Cliquez sur 'Générer' pour créer des synthèses."
              : "Sélectionnez un projet pour voir les synthèses."}
          </p>
        )}
      </div>

      {/* Related Insights Section */}
      {selectedInsightId && (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">Insights connexes</h3>
          </div>

          {relatedInsights.length > 0 ? (
            <div className="space-y-2">
              {relatedInsights.slice(0, 10).map((related) => (
                <div
                  key={related.id}
                  className="rounded-md border bg-background p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Insight {related.id.substring(0, 8)}</span>
                    {related.similarityScore && (
                      <span className="text-xs text-muted-foreground">
                        {(related.similarityScore * 100).toFixed(0)}% similaire
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {related.relationshipTypes.map((type, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-purple-100 px-2 py-1 text-xs text-purple-700"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Chargement des insights connexes...
            </p>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

