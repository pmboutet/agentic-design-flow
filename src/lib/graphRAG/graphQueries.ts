/**
 * Graph queries service for Graph RAG
 * Provides functions to traverse and query the knowledge graph
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";

export interface RelatedInsight {
  id: string;
  path: string[]; // Path of IDs from source to target
  relationshipTypes: string[];
  similarityScore?: number;
}

export interface InsightCluster {
  id: string;
  insightIds: string[];
  size: number;
  averageSimilarity: number;
}

/**
 * Find related insights by traversing the graph (BFS)
 */
export async function findRelatedInsights(
  supabase: SupabaseClient,
  insightId: string,
  depth: number = 2,
  relationshipTypes: string[] = ["SIMILAR_TO", "RELATED_TO"]
): Promise<RelatedInsight[]> {
  const results: RelatedInsight[] = [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; path: string[]; relationshipTypes: string[] }> = [
    { id: insightId, path: [insightId], relationshipTypes: [] },
  ];

  visited.add(insightId);

  let currentDepth = 0;

  while (queue.length > 0 && currentDepth < depth) {
    const levelSize = queue.length;

    for (let i = 0; i < levelSize; i++) {
      const current = queue.shift()!;

      // Find outgoing edges
      const { data: edges } = await supabase
        .from("knowledge_graph_edges")
        .select("target_id, target_type, relationship_type, similarity_score")
        .eq("source_id", current.id)
        .eq("source_type", "insight")
        .in("relationship_type", relationshipTypes);

      if (!edges) {
        continue;
      }

      for (const edge of edges) {
        if (edge.target_type !== "insight") {
          continue;
        }

        if (!visited.has(edge.target_id)) {
          visited.add(edge.target_id);

          const newPath = [...current.path, edge.target_id];
          const newRelationshipTypes = [
            ...current.relationshipTypes,
            edge.relationship_type,
          ];

          results.push({
            id: edge.target_id,
            path: newPath,
            relationshipTypes: newRelationshipTypes,
            similarityScore: edge.similarity_score || undefined,
          });

          if (currentDepth < depth - 1) {
            queue.push({
              id: edge.target_id,
              path: newPath,
              relationshipTypes: newRelationshipTypes,
            });
          }
        }
      }
    }

    currentDepth++;
  }

  return results;
}

/**
 * Find insights by concepts/keywords
 */
export async function findInsightsByConcepts(
  supabase: SupabaseClient,
  concepts: string[],
  projectId?: string
): Promise<string[]> {
  if (concepts.length === 0) {
    return [];
  }

  // Normalize concept names
  const normalizedConcepts = concepts.map((c) =>
    c.toLowerCase().trim().replace(/\s+/g, " ")
  );

  // Find entities matching concepts
  const { data: entities } = await supabase
    .from("knowledge_entities")
    .select("id")
    .in("name", normalizedConcepts);

  if (!entities || entities.length === 0) {
    return [];
  }

  const entityIds = entities.map((e) => e.id);

  // Find insights linked to these entities
  let query = supabase
    .from("insight_keywords")
    .select("insight_id")
    .in("entity_id", entityIds);

  // Filter by project if specified
  if (projectId) {
    // Get project's ask sessions
    const { data: askSessions } = await supabase
      .from("ask_sessions")
      .select("id")
      .eq("project_id", projectId);

    if (askSessions && askSessions.length > 0) {
      const askSessionIds = askSessions.map((s) => s.id);

      // Get insights from these sessions
      const { data: projectInsights } = await supabase
        .from("insights")
        .select("id")
        .in("ask_session_id", askSessionIds);

      if (projectInsights && projectInsights.length > 0) {
        const projectInsightIds = projectInsights.map((i) => i.id);
        query = query.in("insight_id", projectInsightIds);
      } else {
        return [];
      }
    } else {
      return [];
    }
  }

  const { data: keywords } = await query;

  if (!keywords) {
    return [];
  }

  // Get unique insight IDs
  const insightIds = [...new Set(keywords.map((k) => k.insight_id))];
  return insightIds;
}

/**
 * Find insight clusters using graph community detection
 * @param supabase Supabase client
 * @param projectIdOrInsightIds Either a projectId (string) or an array of insight IDs
 * @param minClusterSize Minimum cluster size
 */
export async function findInsightClusters(
  supabase: SupabaseClient,
  projectIdOrInsightIds: string | string[],
  minClusterSize: number = 3
): Promise<InsightCluster[]> {
  let insightIds: string[];

  // If projectId is provided, get insights for that project
  if (typeof projectIdOrInsightIds === "string") {
    const projectId = projectIdOrInsightIds;
    // Get project's insights
    const { data: askSessions } = await supabase
      .from("ask_sessions")
      .select("id")
      .eq("project_id", projectId);

    if (!askSessions || askSessions.length === 0) {
      return [];
    }

    const askSessionIds = askSessions.map((s) => s.id);

    const { data: insights } = await supabase
      .from("insights")
      .select("id")
      .in("ask_session_id", askSessionIds);

    if (!insights || insights.length < minClusterSize) {
      return [];
    }

    insightIds = insights.map((i) => i.id);
  } else {
    // Use provided insight IDs directly
    insightIds = projectIdOrInsightIds;
    if (insightIds.length < minClusterSize) {
      return [];
    }
  }

  // Get all edges between these insights
  const { data: edges } = await supabase
    .from("knowledge_graph_edges")
    .select("source_id, target_id, similarity_score")
    .in("source_id", insightIds)
    .in("target_id", insightIds)
    .eq("source_type", "insight")
    .eq("target_type", "insight")
    .in("relationship_type", ["SIMILAR_TO", "RELATED_TO"]);

  if (!edges || edges.length === 0) {
    return [];
  }

  // Simple clustering: find connected components
  const clusters: Map<string, Set<string>> = new Map();
  const processed = new Set<string>();

  for (const edge of edges) {
    if (!clusters.has(edge.source_id) && !clusters.has(edge.target_id)) {
      // New cluster
      const cluster = new Set([edge.source_id, edge.target_id]);
      clusters.set(edge.source_id, cluster);
      processed.add(edge.source_id);
      processed.add(edge.target_id);
    } else if (clusters.has(edge.source_id) && !clusters.has(edge.target_id)) {
      // Add to existing cluster
      const cluster = clusters.get(edge.source_id)!;
      cluster.add(edge.target_id);
      clusters.set(edge.target_id, cluster);
      processed.add(edge.target_id);
    } else if (!clusters.has(edge.source_id) && clusters.has(edge.target_id)) {
      // Add to existing cluster
      const cluster = clusters.get(edge.target_id)!;
      cluster.add(edge.source_id);
      clusters.set(edge.source_id, cluster);
      processed.add(edge.source_id);
    }
    // If both already in clusters, merge if different
    else {
      const sourceCluster = clusters.get(edge.source_id)!;
      const targetCluster = clusters.get(edge.target_id)!;
      if (sourceCluster !== targetCluster) {
        // Merge clusters
        for (const id of targetCluster) {
          sourceCluster.add(id);
          clusters.set(id, sourceCluster);
        }
      }
    }
  }

  // Convert to result format
  const resultClusters: InsightCluster[] = [];
  const uniqueClusters = new Set(clusters.values());

  for (const cluster of uniqueClusters) {
    if (cluster.size >= minClusterSize) {
      // Calculate average similarity
      let totalSimilarity = 0;
      let similarityCount = 0;

      const clusterIds = Array.from(cluster);
      for (const edge of edges) {
        if (clusterIds.includes(edge.source_id) && clusterIds.includes(edge.target_id)) {
          if (edge.similarity_score) {
            totalSimilarity += edge.similarity_score;
            similarityCount++;
          }
        }
      }

      const avgSimilarity =
        similarityCount > 0 ? totalSimilarity / similarityCount : 0;

      resultClusters.push({
        id: clusterIds[0], // Use first ID as cluster identifier
        insightIds: clusterIds,
        size: cluster.size,
        averageSimilarity: avgSimilarity,
      });
    }
  }

  return resultClusters;
}

/**
 * Get syntheses that include a specific insight
 */
export async function getSynthesisForInsight(
  supabase: SupabaseClient,
  insightId: string
): Promise<Array<{ id: string; synthesizedText: string }>> {
  // Find edges where synthesis SYNTHESIZES this insight
  const { data: edges } = await supabase
    .from("knowledge_graph_edges")
    .select("source_id, source_type")
    .eq("target_id", insightId)
    .eq("target_type", "insight")
    .eq("source_type", "synthesis")
    .eq("relationship_type", "SYNTHESIZES");

  if (!edges || edges.length === 0) {
    return [];
  }

  const synthesisIds = edges.map((e) => e.source_id);

  // Get synthesis details
  const { data: syntheses } = await supabase
    .from("insight_syntheses")
    .select("id, synthesized_text")
    .in("id", synthesisIds);

  if (!syntheses) {
    return [];
  }

  return syntheses.map((s) => ({
    id: s.id,
    synthesizedText: s.synthesized_text,
  }));
}

