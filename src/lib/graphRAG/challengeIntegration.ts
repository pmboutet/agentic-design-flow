/**
 * Challenge Builder integration with Graph RAG
 * Enriches challenge detection with graph-based clustering, syntheses, and concept extraction
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import {
  findInsightClusters,
  findRelatedInsights,
  getSynthesisForInsight,
  type InsightCluster as GraphInsightCluster,
  type RelatedInsight,
} from "./graphQueries";

export interface GraphEnrichmentData {
  clusters: Array<{
    id: string;
    insightIds: string[];
    averageSimilarity: number;
    size: number;
    frequency: number; // Number of similar insights = impact score
    impactScore: number; // averageSimilarity * frequency
    synthesisId?: string;
    synthesisText?: string;
    dominantConcepts: string[];
  }>;
  insightsByConcept: Map<string, string[]>; // concept → insight IDs
  insightSimilarities: Map<string, RelatedInsight[]>; // insightId → similar insights
  syntheses: Array<{
    id: string;
    synthesizedText: string;
    sourceInsightIds: string[];
    keyConcepts: string[];
  }>;
}

export interface EnrichmentOptions {
  minClusterSize?: number;
  minSimilarity?: number;
  maxClusters?: number; // Limit number of clusters returned
}

/**
 * Get project's graph_rag_scope configuration
 */
async function getProjectScope(
  supabase: SupabaseClient,
  projectId: string
): Promise<"project" | "client"> {
  const { data: project } = await supabase
    .from("projects")
    .select("graph_rag_scope, client_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return "project"; // Default fallback
  }

  const scope = project.graph_rag_scope as "project" | "client";

  // Verify client-level access is allowed (must be admin/full_admin)
  if (scope === "client") {
    // This check should be done at API level, but we verify here too
    // For now, we trust the database value - permissions checked at update time
    return "client";
  }

  return "project";
}

/**
 * Get insight IDs for a project or client scope
 */
async function getScopeInsightIds(
  supabase: SupabaseClient,
  projectId: string,
  scope: "project" | "client"
): Promise<string[]> {
  let askSessionIds: string[] | undefined;

  if (scope === "client") {
    // Get all projects for the same client
    const { data: project } = await supabase
      .from("projects")
      .select("client_id")
      .eq("id", projectId)
      .maybeSingle();

    if (!project?.client_id) {
      // Fallback to project scope if no client_id
      scope = "project";
    } else {
      // Get all projects for this client
      const { data: clientProjects } = await supabase
        .from("projects")
        .select("id")
        .eq("client_id", project.client_id);

      if (!clientProjects || clientProjects.length === 0) {
        return [];
      }

      const projectIds = clientProjects.map((p) => p.id);

      // Get all ask sessions for these projects
      const { data: allAskSessions } = await supabase
        .from("ask_sessions")
        .select("id")
        .in("project_id", projectIds);

      askSessionIds = (allAskSessions || []).map((s) => s.id);
    }
  }

  if (scope === "project" || !askSessionIds) {
    // Get project's ask sessions only
    const { data: askSessions } = await supabase
      .from("ask_sessions")
      .select("id")
      .eq("project_id", projectId);

    askSessionIds = (askSessions || []).map((s) => s.id);
  }

  if (askSessionIds.length === 0) {
    return [];
  }

  // Get all insights from these ask sessions
  const { data: insights } = await supabase
    .from("insights")
    .select("id")
    .in("ask_session_id", askSessionIds);

  return (insights || []).map((i) => i.id);
}

/**
 * Get dominant concepts for a cluster of insights
 */
async function getDominantConceptsForCluster(
  supabase: SupabaseClient,
  insightIds: string[]
): Promise<string[]> {
  if (insightIds.length === 0) {
    return [];
  }

  // Get entities linked to these insights
  const { data: keywords } = await supabase
    .from("insight_keywords")
    .select("entity_id, knowledge_entities!inner(name, type)")
    .in("insight_id", insightIds);

  if (!keywords || keywords.length === 0) {
    return [];
  }

  // Count frequency of each concept
  const conceptFrequency = new Map<string, number>();
  for (const kw of keywords) {
    const entity = (kw as any).knowledge_entities;
    if (entity?.name) {
      const name = entity.name.toLowerCase().trim();
      conceptFrequency.set(name, (conceptFrequency.get(name) || 0) + 1);
    }
  }

  // Sort by frequency and return top concepts
  const sortedConcepts = Array.from(conceptFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);

  return sortedConcepts;
}

/**
 * Enrich insights with Graph RAG data for challenge detection
 */
export async function enrichInsightsWithGraphRAG(
  projectId: string,
  options: EnrichmentOptions = {}
): Promise<GraphEnrichmentData> {
  const supabase = getAdminSupabaseClient();
  const {
    minClusterSize = 3,
    minSimilarity = 0.75,
    maxClusters = 10,
  } = options;

  try {
    // Get project scope (project or client)
    const scope = await getProjectScope(supabase, projectId);

    // Get insight IDs based on scope
    const scopeInsightIds = await getScopeInsightIds(supabase, projectId, scope);

    if (scopeInsightIds.length === 0) {
      return {
        clusters: [],
        insightsByConcept: new Map(),
        insightSimilarities: new Map(),
        syntheses: [],
      };
    }

    // Find clusters using graph community detection with scope-aware insight IDs
    const rawClusters = await findInsightClusters(
      supabase,
      scopeInsightIds, // Pass insight IDs directly for scope-aware clustering
      minClusterSize
    );

    // Enrich clusters with additional data
    const enrichedClusters: GraphEnrichmentData["clusters"] = [];
    const allSyntheses: GraphEnrichmentData["syntheses"] = [];
    const insightsByConcept = new Map<string, string[]>();
    const insightSimilarities = new Map<string, RelatedInsight[]>();

    // Process clusters and calculate frequency/impact
    for (const cluster of rawClusters) {
      // Filter to scope-insight IDs only
      const clusterInsightIds = cluster.insightIds.filter((id) =>
        scopeInsightIds.includes(id)
      );

      if (clusterInsightIds.length < minClusterSize) {
        continue;
      }

      // Calculate frequency (number of insights in cluster = impact indicator)
      const frequency = clusterInsightIds.length;

      // Calculate impact score: similarity * frequency
      const impactScore = cluster.averageSimilarity * frequency;

      // Get dominant concepts
      const dominantConcepts = await getDominantConceptsForCluster(
        supabase,
        clusterInsightIds
      );

      // Get synthesis if exists (check first insight)
      let synthesisId: string | undefined;
      let synthesisText: string | undefined;
      if (clusterInsightIds.length > 0) {
        const syntheses = await getSynthesisForInsight(
          supabase,
          clusterInsightIds[0]
        );
        if (syntheses.length > 0) {
          synthesisId = syntheses[0].id;
          synthesisText = syntheses[0].synthesizedText;
          // Add to syntheses list if not already present
          if (!allSyntheses.find((s) => s.id === synthesisId)) {
            // Get full synthesis data
            const { data: synthesisData } = await supabase
              .from("insight_syntheses")
              .select("id, synthesized_text, source_insight_ids, key_concepts")
              .eq("id", synthesisId)
              .maybeSingle();

            if (synthesisData) {
              allSyntheses.push({
                id: synthesisData.id,
                synthesizedText: synthesisData.synthesized_text,
                sourceInsightIds: synthesisData.source_insight_ids || [],
                keyConcepts: (synthesisData.key_concepts || []).map(String),
              });
            }
          }
        }
      }

      // Index concepts
      for (const concept of dominantConcepts) {
        if (!insightsByConcept.has(concept)) {
          insightsByConcept.set(concept, []);
        }
        insightsByConcept.get(concept)!.push(...clusterInsightIds);
      }

      enrichedClusters.push({
        id: cluster.id,
        insightIds: clusterInsightIds,
        averageSimilarity: cluster.averageSimilarity,
        size: cluster.size,
        frequency,
        impactScore,
        synthesisId,
        synthesisText,
        dominantConcepts,
      });
    }

    // Sort clusters by impact score (highest first)
    enrichedClusters.sort((a, b) => b.impactScore - a.impactScore);

    // Limit to top clusters
    const topClusters = enrichedClusters.slice(0, maxClusters);

    // For each insight not in clusters, find related insights
    const clusteredInsightIds = new Set(
      topClusters.flatMap((c) => c.insightIds)
    );
    const unclusteredInsightIds = scopeInsightIds.filter(
      (id) => !clusteredInsightIds.has(id)
    );

    // Find similarities for unclustered insights (limit to avoid too many calls)
    for (const insightId of unclusteredInsightIds.slice(0, 50)) {
      const related = await findRelatedInsights(supabase, insightId, 1, [
        "SIMILAR_TO",
      ]);
      // Filter to scope only
      const scopeRelated = related.filter((r) =>
        scopeInsightIds.includes(r.id)
      );
      if (scopeRelated.length > 0) {
        insightSimilarities.set(insightId, scopeRelated);
      }
    }

    // Deduplicate insights by concept
    const deduplicatedInsightsByConcept = new Map<string, string[]>();
    for (const [concept, insightIds] of insightsByConcept.entries()) {
      deduplicatedInsightsByConcept.set(
        concept,
        Array.from(new Set(insightIds))
      );
    }

    return {
      clusters: topClusters,
      insightsByConcept: deduplicatedInsightsByConcept,
      insightSimilarities,
      syntheses: allSyntheses,
    };
  } catch (error) {
    console.error("[Graph RAG] Error enriching insights:", error);
    // Return empty structure on error (graceful degradation)
    return {
      clusters: [],
      insightsByConcept: new Map(),
      insightSimilarities: new Map(),
      syntheses: [],
    };
  }
}

/**
 * Filter duplicate insights based on graph similarity
 * Returns a filtered list keeping the most representative insight from each similarity group
 */
export async function filterDuplicateInsights(
  insightIds: string[],
  supabase?: SupabaseClient
): Promise<{
  filtered: string[];
  duplicates: Array<{ representative: string; duplicates: string[] }>;
}> {
  const client = supabase || getAdminSupabaseClient();
  const filtered: string[] = [];
  const processed = new Set<string>();
  const duplicates: Array<{ representative: string; duplicates: string[] }> =
    [];

  for (const insightId of insightIds) {
    if (processed.has(insightId)) {
      continue;
    }

    // Find similar insights
    const similar = await findRelatedInsights(client, insightId, 1, [
      "SIMILAR_TO",
    ]);

    // Filter to only include insights from our input list
    const similarInList = similar
      .filter((s) => insightIds.includes(s.id))
      .map((s) => s.id);

    if (similarInList.length > 0) {
      // Group of similar insights
      // Choose the first one as representative (could be improved with better heuristics)
      const representative = insightId;
      const group = [representative, ...similarInList];

      filtered.push(representative);
      duplicates.push({
        representative,
        duplicates: similarInList,
      });

      // Mark all as processed
      group.forEach((id) => processed.add(id));
    } else {
      // No similar insights found, keep it
      filtered.push(insightId);
      processed.add(insightId);
    }
  }

  return { filtered, duplicates };
}

