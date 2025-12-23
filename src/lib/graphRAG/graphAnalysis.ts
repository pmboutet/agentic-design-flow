/**
 * Graph Analysis service using Graphology
 * Provides advanced graph algorithms: community detection, centrality, shortest path
 */

import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { betweenness, pagerank, degree } from "graphology-metrics/centrality";
import { bidirectional } from "graphology-shortest-path";
import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// TYPES
// ============================================================================

export type GraphNodeType = "insight" | "entity" | "challenge" | "synthesis" | "insight_type";

export interface CommunityInfo {
  id: number;
  nodeIds: string[];
  size: number;
  dominantType: GraphNodeType;
  cohesion: number;
}

export interface CentralityMetrics {
  betweenness: Map<string, number>;
  pageRank: Map<string, number>;
  degree: Map<string, number>;
}

export interface CentralityRanking {
  id: string;
  score: number;
  label?: string;
  type?: GraphNodeType;
}

export interface GraphAnalyticsResult {
  projectId: string;
  nodeCount: number;
  edgeCount: number;
  communities: CommunityInfo[];
  centrality: {
    topByBetweenness: CentralityRanking[];
    topByPageRank: CentralityRanking[];
    topByDegree: CentralityRanking[];
  };
  computedAt: string;
}

export interface ShortestPathResult {
  path: string[];
  distance: number;
  edgeLabels: string[];
  nodeLabels: string[];
}

export interface BuildGraphOptions {
  includeEntities?: boolean;
  maxNodes?: number;
}

// ============================================================================
// GRAPH BUILDING
// ============================================================================

/**
 * Build Graphology graph from Supabase data for a given project
 */
export async function buildGraphologyGraph(
  supabase: SupabaseClient,
  projectId: string,
  options: BuildGraphOptions = {}
): Promise<Graph> {
  const { includeEntities = true, maxNodes = 1000 } = options;

  const graph = new Graph({ type: "undirected", allowSelfLoops: false });

  // Fetch ask sessions for project
  const { data: askSessions } = await supabase
    .from("ask_sessions")
    .select("id")
    .eq("project_id", projectId);

  if (!askSessions || askSessions.length === 0) {
    return graph;
  }

  const askSessionIds = askSessions.map((s) => s.id);

  // Fetch insights with their types
  const { data: insights } = await supabase
    .from("insights")
    .select("id, summary, content, insight_type_id, insight_types(name)")
    .in("ask_session_id", askSessionIds)
    .limit(maxNodes);

  if (!insights || insights.length === 0) {
    return graph;
  }

  // Add insight nodes
  for (const insight of insights) {
    const typeName = (insight.insight_types as { name?: string } | null)?.name || "idea";
    const label = insight.summary || insight.content?.substring(0, 50) || "Insight";

    graph.addNode(insight.id, {
      type: "insight" as GraphNodeType,
      label,
      insightType: typeName,
    });
  }

  const insightIds = insights.map((i) => i.id);

  // Fetch edges between insights
  const { data: edges } = await supabase
    .from("knowledge_graph_edges")
    .select("source_id, target_id, relationship_type, similarity_score, confidence")
    .in("source_id", insightIds)
    .in("target_id", insightIds)
    .eq("source_type", "insight")
    .eq("target_type", "insight");

  // Add edges between insights
  for (const edge of edges || []) {
    if (graph.hasNode(edge.source_id) && graph.hasNode(edge.target_id)) {
      const weight = edge.similarity_score || edge.confidence || 0.5;
      try {
        graph.addEdge(edge.source_id, edge.target_id, {
          relationshipType: edge.relationship_type,
          weight,
        });
      } catch {
        // Edge may already exist (undirected graph)
      }
    }
  }

  // Optionally add entity nodes and their connections
  if (includeEntities) {
    const { data: entityEdges } = await supabase
      .from("knowledge_graph_edges")
      .select("source_id, target_id, relationship_type, confidence")
      .in("source_id", insightIds)
      .eq("target_type", "entity")
      .eq("relationship_type", "MENTIONS");

    if (entityEdges && entityEdges.length > 0) {
      const entityIds = new Set<string>();
      for (const edge of entityEdges) {
        entityIds.add(edge.target_id);
      }

      // Fetch entity details
      const { data: entities } = await supabase
        .from("knowledge_entities")
        .select("id, name, type")
        .in("id", Array.from(entityIds));

      // Add entity nodes
      for (const entity of entities || []) {
        graph.addNode(entity.id, {
          type: "entity" as GraphNodeType,
          label: entity.name,
          entityType: entity.type,
        });
      }

      // Add edges from insights to entities
      for (const edge of entityEdges) {
        if (graph.hasNode(edge.source_id) && graph.hasNode(edge.target_id)) {
          try {
            graph.addEdge(edge.source_id, edge.target_id, {
              relationshipType: edge.relationship_type,
              weight: edge.confidence || 0.5,
            });
          } catch {
            // Edge may already exist
          }
        }
      }
    }
  }

  return graph;
}

// ============================================================================
// COMMUNITY DETECTION
// ============================================================================

/**
 * Detect communities using Louvain algorithm
 */
export function detectCommunities(graph: Graph): CommunityInfo[] {
  if (graph.order === 0) {
    return [];
  }

  // Run Louvain algorithm
  const communities = louvain(graph, { resolution: 1.0 });

  // Group nodes by community
  const communityMap = new Map<number, string[]>();

  graph.forEachNode((nodeId) => {
    const communityId = communities[nodeId] as number;
    if (!communityMap.has(communityId)) {
      communityMap.set(communityId, []);
    }
    communityMap.get(communityId)!.push(nodeId);
  });

  // Build community info with stats
  const result: CommunityInfo[] = [];

  for (const [communityId, nodeIds] of communityMap) {
    // Calculate dominant type in this community
    const typeCounts = new Map<GraphNodeType, number>();
    for (const nodeId of nodeIds) {
      const type = (graph.getNodeAttribute(nodeId, "type") as GraphNodeType) || "insight";
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    let dominantType: GraphNodeType = "insight";
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    // Calculate cohesion (internal edge density)
    let internalEdges = 0;
    const nodeIdSet = new Set(nodeIds);

    for (const nodeId of nodeIds) {
      graph.forEachNeighbor(nodeId, (neighbor) => {
        if (nodeIdSet.has(neighbor)) {
          internalEdges++;
        }
      });
    }

    // Each edge is counted twice in undirected graph
    internalEdges = internalEdges / 2;
    const maxPossibleEdges = (nodeIds.length * (nodeIds.length - 1)) / 2;
    const cohesion = maxPossibleEdges > 0 ? internalEdges / maxPossibleEdges : 0;

    result.push({
      id: communityId,
      nodeIds,
      size: nodeIds.length,
      dominantType,
      cohesion: Math.round(cohesion * 1000) / 1000, // Round to 3 decimals
    });
  }

  // Sort by size descending
  result.sort((a, b) => b.size - a.size);

  return result;
}

// ============================================================================
// CENTRALITY METRICS
// ============================================================================

/**
 * Compute centrality metrics for all nodes
 */
export function computeCentrality(graph: Graph): CentralityMetrics {
  if (graph.order === 0) {
    return {
      betweenness: new Map(),
      pageRank: new Map(),
      degree: new Map(),
    };
  }

  // Betweenness centrality (normalized)
  const betweennessObj = betweenness(graph, { normalized: true });
  const betweennessMap = new Map<string, number>(Object.entries(betweennessObj));

  // PageRank
  const pageRankObj = pagerank(graph, {
    alpha: 0.85,
    getEdgeWeight: (_, attr) => attr.weight ?? 1,
  });
  const pageRankMap = new Map<string, number>(Object.entries(pageRankObj));

  // Degree centrality (normalized)
  const degreeObj = degree(graph);
  const degreeMap = new Map<string, number>(Object.entries(degreeObj));

  return { betweenness: betweennessMap, pageRank: pageRankMap, degree: degreeMap };
}

/**
 * Get top N nodes by a centrality metric
 */
export function getTopByCentrality(
  graph: Graph,
  centralityMap: Map<string, number>,
  topN: number = 10
): CentralityRanking[] {
  return Array.from(centralityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, score]) => ({
      id,
      score: Math.round(score * 10000) / 10000, // Round to 4 decimals
      label: graph.hasNode(id) ? graph.getNodeAttribute(id, "label") : undefined,
      type: graph.hasNode(id) ? graph.getNodeAttribute(id, "type") : undefined,
    }));
}

// ============================================================================
// SHORTEST PATH
// ============================================================================

/**
 * Find shortest path between two nodes using Dijkstra
 */
export function findShortestPath(
  graph: Graph,
  sourceId: string,
  targetId: string
): ShortestPathResult | null {
  if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) {
    return null;
  }

  try {
    const path = bidirectional(graph, sourceId, targetId);

    if (!path || path.length === 0) {
      return null;
    }

    // Extract edge labels and node labels along the path
    const edgeLabels: string[] = [];
    const nodeLabels: string[] = [];

    for (let i = 0; i < path.length; i++) {
      const nodeId = path[i];
      const label = graph.getNodeAttribute(nodeId, "label") || nodeId;
      nodeLabels.push(label);

      if (i < path.length - 1) {
        const edgeKey = graph.edge(path[i], path[i + 1]);
        if (edgeKey) {
          const relType = graph.getEdgeAttribute(edgeKey, "relationshipType") || "CONNECTED";
          edgeLabels.push(relType);
        } else {
          edgeLabels.push("CONNECTED");
        }
      }
    }

    return {
      path,
      distance: path.length - 1,
      edgeLabels,
      nodeLabels,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// FULL ANALYTICS
// ============================================================================

/**
 * Compute full analytics for a project (communities + centrality)
 */
export async function computeGraphAnalytics(
  supabase: SupabaseClient,
  projectId: string,
  options: BuildGraphOptions = {}
): Promise<GraphAnalyticsResult> {
  const graph = await buildGraphologyGraph(supabase, projectId, options);

  const communities = detectCommunities(graph);
  const centrality = computeCentrality(graph);

  return {
    projectId,
    nodeCount: graph.order,
    edgeCount: graph.size,
    communities,
    centrality: {
      topByBetweenness: getTopByCentrality(graph, centrality.betweenness, 10),
      topByPageRank: getTopByCentrality(graph, centrality.pageRank, 10),
      topByDegree: getTopByCentrality(graph, centrality.degree, 10),
    },
    computedAt: new Date().toISOString(),
  };
}

/**
 * Get node analytics (community + centrality) as a Map for enriching visualization
 */
export function getNodeAnalyticsMap(
  communities: CommunityInfo[],
  centrality: CentralityMetrics
): Map<string, { community?: number; betweenness?: number; pageRank?: number; degree?: number }> {
  const nodeAnalytics = new Map<string, {
    community?: number;
    betweenness?: number;
    pageRank?: number;
    degree?: number;
  }>();

  // Add community info
  for (const community of communities) {
    for (const nodeId of community.nodeIds) {
      nodeAnalytics.set(nodeId, {
        ...nodeAnalytics.get(nodeId),
        community: community.id,
      });
    }
  }

  // Add centrality metrics
  for (const [nodeId, score] of centrality.betweenness) {
    nodeAnalytics.set(nodeId, {
      ...nodeAnalytics.get(nodeId),
      betweenness: score,
    });
  }

  for (const [nodeId, score] of centrality.pageRank) {
    nodeAnalytics.set(nodeId, {
      ...nodeAnalytics.get(nodeId),
      pageRank: score,
    });
  }

  for (const [nodeId, score] of centrality.degree) {
    nodeAnalytics.set(nodeId, {
      ...nodeAnalytics.get(nodeId),
      degree: score,
    });
  }

  return nodeAnalytics;
}
