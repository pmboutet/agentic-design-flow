import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import type { ApiResponse } from "@/types";

type GraphNodeType = "insight" | "entity" | "challenge" | "synthesis" | string;

/**
 * Normalize entity name for deduplication in visualization
 * Must match the normalization in extractEntities.ts
 */
function normalizeEntityNameForVisualization(name: string): string {
  let normalized = name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(l'|la |le |les |un |une |des |du |de la |de l')/i, "")
    .replace(/ (de la |de l'|du |des |d')/g, " ")
    .replace(/^(the |a |an )/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "")
    .replace(/tion$/, "")
    .replace(/tions$/, "")
    .replace(/ment$/, "")
    .replace(/ments$/, "");

  if (!normalized) {
    normalized = name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  return normalized;
}

interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  meta?: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  label?: string;
  weight?: number;
  confidence?: number | null;
}

interface GraphVisualizationResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    insights: number;
    entities: number;
    challenges: number;
    syntheses: number;
    edges: number;
  };
}

function formatInsightLabel(row: { summary?: string | null; content?: string | null }): string {
  const source = row.summary?.trim() || row.content?.trim() || "Insight";
  return source.length > 120 ? `${source.slice(0, 117)}...` : source;
}

function relationshipLabel(type: string): string {
  switch (type) {
    case "SIMILAR_TO":
      return "Similarité";
    case "RELATED_TO":
      return "Connexe";
    case "MENTIONS":
      return "Mention";
    case "SYNTHESIZES":
      return "Synthèse";
    case "CONTAINS":
      return "Contient";
    default:
      return type;
  }
}

/**
 * Get all child challenge IDs recursively for a given challenge
 */
async function getChallengeWithChildren(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  challengeId: string
): Promise<string[]> {
  const allChallengeIds = new Set<string>([challengeId]);

  // Fetch all challenges and build hierarchy locally (more efficient than recursive queries)
  const { data: allChallenges, error } = await supabase
    .from("challenges")
    .select("id, parent_challenge_id");

  if (error || !allChallenges) {
    return [challengeId];
  }

  // Build parent-to-children map
  const childrenMap = new Map<string, string[]>();
  for (const challenge of allChallenges) {
    if (challenge.parent_challenge_id) {
      if (!childrenMap.has(challenge.parent_challenge_id)) {
        childrenMap.set(challenge.parent_challenge_id, []);
      }
      childrenMap.get(challenge.parent_challenge_id)!.push(challenge.id);
    }
  }

  // BFS to find all descendants
  const queue = [challengeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenMap.get(current) || [];
    for (const child of children) {
      if (!allChallengeIds.has(child)) {
        allChallengeIds.add(child);
        queue.push(child);
      }
    }
  }

  return Array.from(allChallengeIds);
}

export async function GET(request: NextRequest) {
  const supabase = getAdminSupabaseClient();
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId");
  const clientId = searchParams.get("clientId");
  const challengeId = searchParams.get("challengeId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500);

  try {
    // Build the base query for insights
    let insightQuery = supabase
      .from("insights")
      .select("id, summary, content, created_at, ask_session_id, challenge_id")
      .order("created_at", { ascending: false })
      .limit(limit);

    // Get relevant ASK session IDs based on filters
    let askSessionIds: string[] = [];
    let filterChallengeIds: string[] = [];

    // Apply challenge filter (includes children)
    if (challengeId) {
      filterChallengeIds = await getChallengeWithChildren(supabase, challengeId);
    }

    // Apply project/client filter to get relevant ask sessions
    if (projectId) {
      let projectQuery = supabase.from("ask_sessions").select("id").eq("project_id", projectId);

      // If we have challenge filter, also filter by challenge
      if (filterChallengeIds.length > 0) {
        projectQuery = projectQuery.in("challenge_id", filterChallengeIds);
      }

      const { data: askSessions, error: askError } = await projectQuery;

      if (askError) {
        throw askError;
      }

      if (!askSessions || askSessions.length === 0) {
        return NextResponse.json<ApiResponse<GraphVisualizationResponse>>({
          success: true,
          data: { nodes: [], edges: [], stats: { insights: 0, entities: 0, challenges: 0, syntheses: 0, edges: 0 } },
          message: "Aucun ASK trouvé pour ce projet",
        });
      }

      askSessionIds = askSessions.map((session) => session.id);
    } else if (clientId) {
      // Filter by client: get all projects for this client, then their ask sessions
      const { data: projects, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("client_id", clientId);

      if (projectError) {
        throw projectError;
      }

      if (!projects || projects.length === 0) {
        return NextResponse.json<ApiResponse<GraphVisualizationResponse>>({
          success: true,
          data: { nodes: [], edges: [], stats: { insights: 0, entities: 0, challenges: 0, syntheses: 0, edges: 0 } },
          message: "Aucun projet trouvé pour ce client",
        });
      }

      const projectIds = projects.map((p) => p.id);
      let askQuery = supabase.from("ask_sessions").select("id").in("project_id", projectIds);

      if (filterChallengeIds.length > 0) {
        askQuery = askQuery.in("challenge_id", filterChallengeIds);
      }

      const { data: askSessions, error: askError } = await askQuery;

      if (askError) {
        throw askError;
      }

      askSessionIds = (askSessions || []).map((session) => session.id);
    }

    // Apply ask session filter if we have IDs
    if (askSessionIds.length > 0) {
      insightQuery = insightQuery.in("ask_session_id", askSessionIds);
    }

    // Also filter insights by challenge_id if challenge filter is set
    if (filterChallengeIds.length > 0) {
      insightQuery = insightQuery.in("challenge_id", filterChallengeIds);
    }

    const { data: insights, error: insightError } = await insightQuery;
    if (insightError) {
      throw insightError;
    }

    const insightIds = insights?.map((insight) => insight.id) ?? [];
    const nodes: Map<string, GraphNode> = new Map();
    const nodeTypes: Map<string, GraphNodeType> = new Map();

    for (const insight of insights ?? []) {
      nodes.set(insight.id, {
        id: insight.id,
        type: "insight",
        label: formatInsightLabel(insight),
        meta: {
          createdAt: insight.created_at,
          challengeId: insight.challenge_id,
        },
      });
      nodeTypes.set(insight.id, "insight");
    }

    if (insightIds.length === 0) {
      return NextResponse.json<ApiResponse<GraphVisualizationResponse>>({
        success: true,
        data: {
          nodes: Array.from(nodes.values()),
          edges: [],
          stats: { insights: 0, entities: 0, challenges: 0, syntheses: 0, edges: 0 },
        },
      });
    }

    // Fetch edges touching these insights - get edges where either source or target is one of our insights
    const { data: sourceEdges, error: sourceError } = await supabase
      .from("knowledge_graph_edges")
      .select("source_id, source_type, target_id, target_type, relationship_type, similarity_score, confidence, metadata")
      .eq("source_type", "insight")
      .in("source_id", insightIds)
      .limit(limit * 2);

    if (sourceError) {
      throw sourceError;
    }

    const { data: targetEdges, error: targetError } = await supabase
      .from("knowledge_graph_edges")
      .select("source_id, source_type, target_id, target_type, relationship_type, similarity_score, confidence, metadata")
      .eq("target_type", "insight")
      .in("target_id", insightIds)
      .limit(limit * 2);

    if (targetError) {
      throw targetError;
    }

    // Combine and deduplicate edges
    const edgeMap = new Map<string, any>();
    for (const edge of [...(sourceEdges ?? []), ...(targetEdges ?? [])]) {
      const key = `${edge.source_id}-${edge.target_id}-${edge.relationship_type}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, edge);
      }
    }
    const edgeData = Array.from(edgeMap.values());

    const edges: GraphEdge[] = [];
    const entityIds = new Set<string>();
    const challengeIds = new Set<string>();
    const synthesisIds = new Set<string>();

    for (const [index, edge] of (edgeData ?? []).entries()) {
      const edgeId = `edge-${index}-${edge.source_id}-${edge.target_id}-${edge.relationship_type}`;
      edges.push({
        id: edgeId,
        source: edge.source_id,
        target: edge.target_id,
        relationshipType: edge.relationship_type,
        label: relationshipLabel(edge.relationship_type),
        weight: edge.similarity_score ?? edge.confidence ?? undefined,
        confidence: edge.confidence ?? null,
      });

      nodeTypes.set(edge.source_id, edge.source_type);
      nodeTypes.set(edge.target_id, edge.target_type);

      if (edge.source_type === "entity") {
        entityIds.add(edge.source_id);
      } else if (edge.source_type === "challenge") {
        challengeIds.add(edge.source_id);
      } else if (edge.source_type === "synthesis") {
        synthesisIds.add(edge.source_id);
      }

      if (edge.target_type === "entity") {
        entityIds.add(edge.target_id);
      } else if (edge.target_type === "challenge") {
        challengeIds.add(edge.target_id);
      } else if (edge.target_type === "synthesis") {
        synthesisIds.add(edge.target_id);
      }
    }

    // Entities - with deduplication by normalized name
    const entityIdMapping = new Map<string, string>();

    if (entityIds.size > 0) {
      const { data: entities, error: entityError } = await supabase
        .from("knowledge_entities")
        .select("id, name, type, description, frequency")
        .in("id", Array.from(entityIds));

      if (entityError) {
        throw entityError;
      }

      // Group entities by normalized name to find duplicates
      const normalizedNameToEntities = new Map<string, typeof entities>();
      for (const entity of entities ?? []) {
        const normalizedName = normalizeEntityNameForVisualization(entity.name || "");
        const key = `${normalizedName}:${entity.type}`;

        if (!normalizedNameToEntities.has(key)) {
          normalizedNameToEntities.set(key, []);
        }
        normalizedNameToEntities.get(key)!.push(entity);
      }

      // For each group, select the canonical entity (highest frequency or first)
      for (const [, entityGroup] of normalizedNameToEntities) {
        if (!entityGroup || entityGroup.length === 0) continue;

        entityGroup.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
        const canonicalEntity = entityGroup[0];

        for (const entity of entityGroup) {
          entityIdMapping.set(entity.id, canonicalEntity.id);
        }

        const totalFrequency = entityGroup.reduce((sum, e) => sum + (e.frequency || 0), 0);

        nodes.set(canonicalEntity.id, {
          id: canonicalEntity.id,
          type: "entity",
          label: canonicalEntity.name || "Entité",
          subtitle: canonicalEntity.type || undefined,
          meta: {
            description: canonicalEntity.description,
            frequency: totalFrequency,
            mergedCount: entityGroup.length > 1 ? entityGroup.length : undefined,
          },
        });
        nodeTypes.set(canonicalEntity.id, "entity");
      }
    }

    // Update edges to use canonical entity IDs
    const deduplicatedEdges: GraphEdge[] = [];
    const seenEdgeKeys = new Set<string>();

    for (const edge of edges) {
      const remappedSource = entityIdMapping.get(edge.source) || edge.source;
      const remappedTarget = entityIdMapping.get(edge.target) || edge.target;

      if (remappedSource === remappedTarget) continue;

      const edgeKey = `${remappedSource}-${remappedTarget}-${edge.relationshipType}`;
      if (seenEdgeKeys.has(edgeKey)) continue;
      seenEdgeKeys.add(edgeKey);

      deduplicatedEdges.push({
        ...edge,
        source: remappedSource,
        target: remappedTarget,
      });
    }

    // Challenges
    if (challengeIds.size > 0) {
      const { data: challenges, error: challengeError } = await supabase
        .from("challenges")
        .select("id, name, status, priority")
        .in("id", Array.from(challengeIds));

      if (challengeError) {
        throw challengeError;
      }

      for (const challenge of challenges ?? []) {
        nodes.set(challenge.id, {
          id: challenge.id,
          type: "challenge",
          label: challenge.name || "Challenge",
          subtitle: challenge.status || undefined,
          meta: {
            priority: challenge.priority,
          },
        });
        nodeTypes.set(challenge.id, "challenge");
      }
    }

    // Syntheses
    if (synthesisIds.size > 0) {
      const { data: syntheses, error: synthesisError } = await supabase
        .from("insight_syntheses")
        .select("id, synthesized_text, project_id")
        .in("id", Array.from(synthesisIds));

      if (synthesisError) {
        throw synthesisError;
      }

      for (const synthesis of syntheses ?? []) {
        const label = synthesis.synthesized_text?.trim() || "Synthèse";
        nodes.set(synthesis.id, {
          id: synthesis.id,
          type: "synthesis",
          label: label.length > 120 ? `${label.slice(0, 117)}...` : label,
          subtitle: synthesis.project_id ? `Projet ${synthesis.project_id.slice(0, 4)}…` : undefined,
        });
        nodeTypes.set(synthesis.id, "synthesis");
      }
    }

    // Ensure every node touched by a deduplicated edge exists
    for (const edge of deduplicatedEdges) {
      if (!nodes.has(edge.source)) {
        const type = nodeTypes.get(edge.source) || "entity";
        nodes.set(edge.source, {
          id: edge.source,
          type,
          label: `${type} ${edge.source.slice(0, 6)}…`,
        });
      }
      if (!nodes.has(edge.target)) {
        const type = nodeTypes.get(edge.target) || "entity";
        nodes.set(edge.target, {
          id: edge.target,
          type,
          label: `${type} ${edge.target.slice(0, 6)}…`,
        });
      }
    }

    // Count unique entities after deduplication
    const uniqueEntityIds = new Set<string>();
    entityIdMapping.forEach((canonicalId) => uniqueEntityIds.add(canonicalId));

    return NextResponse.json<ApiResponse<GraphVisualizationResponse>>({
      success: true,
      data: {
        nodes: Array.from(nodes.values()),
        edges: deduplicatedEdges,
        stats: {
          insights: (insights ?? []).length,
          entities: uniqueEntityIds.size,
          challenges: Array.from(challengeIds).length,
          syntheses: Array.from(synthesisIds).length,
          edges: deduplicatedEdges.length,
        },
      },
    });
  } catch (error) {
    console.error("Error building graph visualization response:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
