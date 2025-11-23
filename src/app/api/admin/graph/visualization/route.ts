import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import type { ApiResponse } from "@/types";

type GraphNodeType = "insight" | "entity" | "challenge" | "synthesis" | string;

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

export async function GET(request: NextRequest) {
  const supabase = getAdminSupabaseClient();
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500);

  try {
    // Fetch insights for the project (or latest if no projectId)
    let insightQuery = supabase
      .from("insights")
      .select("id, summary, content, created_at, ask_session_id, challenge_id")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (projectId) {
      const { data: askSessions, error: askError } = await supabase
        .from("ask_sessions")
        .select("id")
        .eq("project_id", projectId);

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

      const askSessionIds = askSessions.map((session) => session.id);
      insightQuery = insightQuery.in("ask_session_id", askSessionIds);
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
      .limit(limit);

    if (sourceError) {
      throw sourceError;
    }

    const { data: targetEdges, error: targetError } = await supabase
      .from("knowledge_graph_edges")
      .select("source_id, source_type, target_id, target_type, relationship_type, similarity_score, confidence, metadata")
      .eq("target_type", "insight")
      .in("target_id", insightIds)
      .limit(limit);

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

    // Entities
    if (entityIds.size > 0) {
      const { data: entities, error: entityError } = await supabase
        .from("knowledge_entities")
        .select("id, name, type, description, frequency")
        .in("id", Array.from(entityIds));

      if (entityError) {
        throw entityError;
      }

      for (const entity of entities ?? []) {
        nodes.set(entity.id, {
          id: entity.id,
          type: "entity",
          label: entity.name || "Entité",
          subtitle: entity.type || undefined,
          meta: {
            description: entity.description,
            frequency: entity.frequency,
          },
        });
        nodeTypes.set(entity.id, "entity");
      }
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

    // Ensure every node touched by an edge exists
    nodeTypes.forEach((type, id) => {
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          type,
          label: `${type} ${id.slice(0, 6)}…`,
        });
      }
    });

    return NextResponse.json<ApiResponse<GraphVisualizationResponse>>({
      success: true,
      data: {
        nodes: Array.from(nodes.values()),
        edges,
        stats: {
          insights: (insights ?? []).length,
          entities: Array.from(entityIds).length,
          challenges: Array.from(challengeIds).length,
          syntheses: Array.from(synthesisIds).length,
          edges: edges.length,
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
      { status: 500 },
    );
  }
}
