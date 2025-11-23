"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Layers, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResponse } from "@/types";

const ForceGraph2D = dynamic(
  async () => {
    // Import THREE and expose it globally for react-force-graph
    const THREE = await import("three");
    if (typeof window !== 'undefined') {
      // Create a mutable proxy/wrapper that react-force-graph can extend
      if (!(window as any).THREE) {
        (window as any).THREE = Object.assign({}, THREE);
        // Copy all properties from the THREE module
        Object.setPrototypeOf((window as any).THREE, THREE);
      }

      // Polyfill AFRAME for VR features (which we don't use)
      if (!(window as any).AFRAME) {
        (window as any).AFRAME = {
          registerComponent: () => {},
          registerSystem: () => {},
          registerGeometry: () => {},
          registerPrimitive: () => {},
          registerShader: () => {},
          components: {},
          systems: {},
          geometries: {},
          primitives: {},
          shaders: {},
          utils: {
            device: {},
            coordinates: {}
          }
        };
      }
    }

    return import("react-force-graph").then(mod => mod.ForceGraph2D);
  },
  {
    ssr: false
  }
);

type GraphNodeType = "insight" | "entity" | "challenge" | "synthesis" | string;

interface GraphNodeResponse {
  id: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  meta?: Record<string, unknown>;
}

interface GraphEdgeResponse {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  label?: string;
  weight?: number;
  confidence?: number | null;
}

interface GraphPayload {
  nodes: GraphNodeResponse[];
  edges: GraphEdgeResponse[];
  stats: {
    insights: number;
    entities: number;
    challenges: number;
    syntheses: number;
    edges: number;
  };
}

interface ProjectGraphVisualizationProps {
  projectId?: string | null;
  refreshKey?: number;
}

const nodeColors: Record<string, string> = {
  insight: "#6366F1",
  entity: "#0EA5E9",
  challenge: "#F97316",
  synthesis: "#A855F7",
  default: "#94A3B8",
};

const edgeColors: Record<string, string> = {
  SIMILAR_TO: "#22d3ee",
  RELATED_TO: "#a78bfa",
  MENTIONS: "#38bdf8",
  SYNTHESIZES: "#f472b6",
  CONTAINS: "#eab308",
};

interface ForceGraphNode {
  id: string;
  name: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  color: string;
  val: number;
}

interface ForceGraphLink {
  source: string;
  target: string;
  label: string;
  color: string;
  width: number;
}

interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

function buildForceGraphData(payload: GraphPayload): ForceGraphData {
  const nodes: ForceGraphNode[] = payload.nodes.map((node) => {
    const color = nodeColors[node.type] || nodeColors.default;
    const val = node.type === "insight" ? 8 : node.type === "challenge" ? 6 : 4;

    return {
      id: node.id,
      name: node.label,
      type: node.type,
      label: node.label,
      subtitle: node.subtitle,
      color,
      val,
    };
  });

  const links: ForceGraphLink[] = payload.edges.map((edge) => {
    const color = edgeColors[edge.relationshipType] || "#94A3B8";
    return {
      source: edge.source,
      target: edge.target,
      label: edge.label || edge.relationshipType,
      color,
      width: Math.max(1, (edge.weight ?? 0.4) * 2),
    };
  });

  return { nodes, links };
}

export function ProjectGraphVisualization({ projectId, refreshKey }: ProjectGraphVisualizationProps) {
  const [graphData, setGraphData] = useState<ForceGraphData | null>(null);
  const [stats, setStats] = useState<GraphPayload["stats"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const fgRef = useRef<any>();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadGraph = useCallback(async () => {
    if (!projectId) {
      setError("Sélectionnez un projet pour afficher le graphe.");
      setGraphData(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/graph/visualization?projectId=${projectId}&limit=250`, {
        cache: "no-store",
      });
      const payload: ApiResponse<GraphPayload> = await response.json();

      if (payload.success && payload.data) {
        setGraphData(buildForceGraphData(payload.data));
        setStats(payload.data.stats);
      } else {
        setError(payload.error || "Impossible de charger le graphe");
        setGraphData(null);
        setStats(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setGraphData(null);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph, refreshKey]);


  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-white">Visualisation du graphe</p>
            <p className="text-xs text-muted-foreground">
              Insights, entités et challenges liés au projet.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats && (
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{stats.insights} insights</span>
              <span>•</span>
              <span>{stats.entities} entités</span>
              <span>•</span>
              <span>{stats.edges} liens</span>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={loadGraph}
            disabled={isLoading || !projectId}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Rafraîchir
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {!projectId && (
        <div className="rounded-md border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          Choisissez un projet pour afficher son graphe de connaissances.
        </div>
      )}

      {projectId && (
        <div className="rounded-md border bg-background/60 p-2">
          {isLoading && !graphData ? (
            <div className="flex h-[420px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : graphData && isMounted ? (
            <div className="h-[460px] rounded-md overflow-hidden" style={{ background: "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08), transparent 35%), #0f172a" }}>
              {typeof window !== 'undefined' && (
                <ForceGraph2D
                  ref={fgRef}
                  graphData={graphData}
                  nodeLabel="name"
                  nodeColor="color"
                  nodeVal="val"
                  nodeCanvasObject={(node: any, ctx, globalScale) => {
                    const label = node.name;
                    const fontSize = 12/globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    const textWidth = ctx.measureText(label).width;
                    const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);

                    ctx.fillStyle = node.color;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
                    ctx.fill();

                    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
                    ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y + node.val + 2, bckgDimensions[0], bckgDimensions[1]);

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#E2E8F0';
                    ctx.fillText(label, node.x, node.y + node.val + 2 + bckgDimensions[1] / 2);
                  }}
                  linkColor="color"
                  linkWidth="width"
                  linkDirectionalParticles={2}
                  linkDirectionalParticleWidth={2}
                  backgroundColor="transparent"
                  width={800}
                  height={460}
                />
              )}
            </div>
          ) : (
            <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
              Aucun graphe à afficher pour le moment.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
