"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Layers, Loader2, RefreshCw, Maximize2, Minimize2, X } from "lucide-react";
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

// Softer colors with transparency
const nodeColors: Record<string, string> = {
  insight: "rgba(99, 102, 241, 0.85)",      // indigo with transparency
  entity: "rgba(14, 165, 233, 0.85)",        // cyan with transparency
  challenge: "rgba(249, 115, 22, 0.85)",     // orange with transparency
  synthesis: "rgba(168, 85, 247, 0.85)",     // purple with transparency
  default: "rgba(148, 163, 184, 0.85)",      // slate with transparency
};

// Solid colors for legend
const nodeSolidColors: Record<string, string> = {
  insight: "#6366F1",
  entity: "#0EA5E9",
  challenge: "#F97316",
  synthesis: "#A855F7",
  default: "#94A3B8",
};

const nodeLabels: Record<string, string> = {
  insight: "Insights",
  entity: "Entités",
  challenge: "Challenges",
  synthesis: "Synthèses",
};

const edgeColors: Record<string, string> = {
  SIMILAR_TO: "rgba(34, 211, 238, 0.6)",
  RELATED_TO: "rgba(167, 139, 250, 0.6)",
  MENTIONS: "rgba(56, 189, 248, 0.6)",
  SYNTHESIZES: "rgba(244, 114, 182, 0.6)",
  CONTAINS: "rgba(234, 179, 8, 0.6)",
};

interface ForceGraphNode {
  id: string;
  name: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  color: string;
  val: number;
  x?: number;
  y?: number;
}

interface ForceGraphLink {
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
  label: string;
  color: string;
  width: number;
}

interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

/**
 * Normalize entity label for frontend deduplication
 * This is a safety net in case API deduplication misses something
 */
function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(l'|la |le |les |un |une |des |du |de la |de l')/i, "")
    .replace(/ (de la |de l'|du |des |d')/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildForceGraphData(payload: GraphPayload): ForceGraphData {
  // Deduplicate nodes by normalized label (safety net)
  const seenLabels = new Map<string, string>(); // normalized label -> canonical node id
  const nodeIdMapping = new Map<string, string>(); // original id -> canonical id

  // First pass: identify duplicates and map to canonical nodes
  for (const node of payload.nodes) {
    // Only deduplicate entity nodes
    if (node.type === "entity") {
      const normalizedLabel = normalizeLabel(node.label);
      const key = `${normalizedLabel}:${node.subtitle || ""}`; // Include subtype

      if (seenLabels.has(key)) {
        // This is a duplicate, map to canonical
        nodeIdMapping.set(node.id, seenLabels.get(key)!);
      } else {
        // This is the canonical node for this label
        seenLabels.set(key, node.id);
        nodeIdMapping.set(node.id, node.id);
      }
    } else {
      // Non-entity nodes are always canonical
      nodeIdMapping.set(node.id, node.id);
    }
  }

  // Build deduplicated nodes
  const uniqueNodeIds = new Set(nodeIdMapping.values());
  const nodes: ForceGraphNode[] = payload.nodes
    .filter((node) => uniqueNodeIds.has(node.id) && nodeIdMapping.get(node.id) === node.id)
    .map((node) => {
      const color = nodeColors[node.type] || nodeColors.default;
      // Smaller node sizes
      const val = node.type === "insight" ? 4 : node.type === "challenge" ? 3.5 : node.type === "synthesis" ? 3.5 : 2.5;

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

  // Build deduplicated links with remapped node IDs
  const seenLinkKeys = new Set<string>();
  const links: ForceGraphLink[] = [];

  for (const edge of payload.edges) {
    const remappedSource = nodeIdMapping.get(edge.source) || edge.source;
    const remappedTarget = nodeIdMapping.get(edge.target) || edge.target;

    // Skip self-loops and duplicates
    if (remappedSource === remappedTarget) continue;

    const linkKey = `${remappedSource}-${remappedTarget}-${edge.relationshipType}`;
    if (seenLinkKeys.has(linkKey)) continue;
    seenLinkKeys.add(linkKey);

    const color = edgeColors[edge.relationshipType] || "rgba(148, 163, 184, 0.6)";
    links.push({
      source: remappedSource,
      target: remappedTarget,
      label: edge.label || edge.relationshipType,
      color,
      width: Math.max(1, (edge.weight ?? 0.4) * 2),
    });
  }

  return { nodes, links };
}

export function ProjectGraphVisualization({ projectId, refreshKey }: ProjectGraphVisualizationProps) {
  const [graphData, setGraphData] = useState<ForceGraphData | null>(null);
  const [stats, setStats] = useState<GraphPayload["stats"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<ForceGraphNode | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>({
    insight: true,
    entity: true,
    challenge: true,
    synthesis: true,
  });
  const [zoomLevel, setZoomLevel] = useState(1);
  const fgRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Get connected node IDs for selected node
  const connectedNodeIds = useMemo(() => {
    if (!selectedNode || !graphData) return new Set<string>();

    const connected = new Set<string>();
    connected.add(selectedNode.id);

    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;

      if (sourceId === selectedNode.id) {
        connected.add(targetId);
      }
      if (targetId === selectedNode.id) {
        connected.add(sourceId);
      }
    });

    return connected;
  }, [selectedNode, graphData]);

  // Filter graph data based on visible types
  const filteredGraphData = useMemo(() => {
    if (!graphData) return null;

    const visibleNodeIds = new Set(
      graphData.nodes
        .filter(node => visibleTypes[node.type] !== false)
        .map(node => node.id)
    );

    return {
      nodes: graphData.nodes.filter(node => visibleNodeIds.has(node.id)),
      links: graphData.links.filter(link => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
        return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
      }),
    };
  }, [graphData, visibleTypes]);

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

  // Handle fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
    setSelectedNode(null);
  }, []);

  // Re-fit graph when fullscreen changes
  useEffect(() => {
    if (fgRef.current) {
      // Small delay to let the container resize
      setTimeout(() => {
        fgRef.current?.zoomToFit(400, 60);
      }, 100);
    }
  }, [isFullscreen]);

  // Configure D3 forces
  useEffect(() => {
    if (fgRef.current) {
      // Very strong repulsion between nodes
      fgRef.current.d3Force('charge')?.strength(-2000);
      // Much larger link distance
      fgRef.current.d3Force('link')?.distance(250);
    }
  }, [filteredGraphData]);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        setSelectedNode(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Toggle node type visibility
  const toggleNodeType = useCallback((type: string) => {
    setVisibleTypes(prev => ({
      ...prev,
      [type]: !prev[type],
    }));
  }, []);

  // Handle node click
  const handleNodeClick = useCallback((node: { id?: string | number; [key: string]: unknown }, _event: MouseEvent) => {
    const forceNode = node as unknown as ForceGraphNode;
    setSelectedNode(prev => prev?.id === forceNode.id ? null : forceNode);
  }, []);

  // Handle zoom change
  const handleZoom = useCallback((transform: { k: number }) => {
    setZoomLevel(transform.k);
  }, []);

  // Calculate dimensions
  const dimensions = useMemo(() => {
    if (isFullscreen) {
      return { width: typeof window !== 'undefined' ? window.innerWidth : 1200, height: typeof window !== 'undefined' ? window.innerHeight : 800 };
    }
    return { width: 800, height: 460 };
  }, [isFullscreen]);

  // Node canvas rendering with zoom-aware labels
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isSelected = selectedNode?.id === node.id;
    const isConnected = connectedNodeIds.has(node.id);
    const shouldShowLabel = selectedNode ? isConnected : true;

    // Determine node importance for zoom-based visibility
    const nodeImportance = node.type === 'challenge' ? 3 : node.type === 'synthesis' ? 2.5 : node.type === 'insight' ? 2 : 1;
    const labelVisibilityThreshold = 0.3 / nodeImportance;
    const showLabel = shouldShowLabel && (globalScale > labelVisibilityThreshold || isSelected);

    // Dim non-connected nodes when a node is selected
    const alpha = selectedNode && !isConnected ? 0.15 : 1;

    // Parse color and apply alpha
    let nodeColor = node.color;
    if (alpha < 1) {
      // Make dimmed nodes more transparent
      nodeColor = node.color.replace(/[\d.]+\)$/, `${alpha * 0.5})`);
    }

    // Draw node
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
    ctx.fillStyle = nodeColor;
    ctx.fill();

    // Draw selection ring
    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    }

    // Draw label
    if (showLabel) {
      const label = node.name;
      // Font size between 2.4 and 5 pixels
      const fontSize = Math.min(5, Math.max(2.4, 3.5 / globalScale));
      ctx.font = `${fontSize}px Sans-Serif`;

      // Word wrap for long labels - triple width for more text
      const maxWidth = 360 / globalScale;
      const words = label.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = ctx.measureText(testLine).width;
        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      // Limit to 5 lines max
      const displayLines = lines.slice(0, 5);
      if (lines.length > 5) {
        displayLines[4] = displayLines[4].slice(0, -3) + '...';
      }

      const lineHeight = fontSize * 1.2;
      const maxTextWidth = Math.max(...displayLines.map(l => ctx.measureText(l).width));
      const boxWidth = maxTextWidth + fontSize * 0.4;
      const boxHeight = displayLines.length * lineHeight + fontSize * 0.3;
      const boxX = node.x - boxWidth / 2;
      const boxY = node.y + node.val + 3;
      const borderRadius = fontSize * 0.3;

      // Background with rounded corners
      ctx.fillStyle = `rgba(15, 23, 42, ${alpha * 0.85})`;
      ctx.beginPath();
      ctx.moveTo(boxX + borderRadius, boxY);
      ctx.lineTo(boxX + boxWidth - borderRadius, boxY);
      ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + borderRadius);
      ctx.lineTo(boxX + boxWidth, boxY + boxHeight - borderRadius);
      ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - borderRadius, boxY + boxHeight);
      ctx.lineTo(boxX + borderRadius, boxY + boxHeight);
      ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - borderRadius);
      ctx.lineTo(boxX, boxY + borderRadius);
      ctx.quadraticCurveTo(boxX, boxY, boxX + borderRadius, boxY);
      ctx.closePath();
      ctx.fill();

      // Text lines
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(226, 232, 240, ${alpha})`;
      displayLines.forEach((line, i) => {
        const lineY = boxY + (i + 0.5) * lineHeight + fontSize * 0.15;
        ctx.fillText(line, node.x, lineY);
      });
    }
  }, [selectedNode, connectedNodeIds]);

  // Link rendering with dimming for non-connected
  const linkColor = useCallback((link: any) => {
    if (!selectedNode) return link.color;

    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;

    if (connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId)) {
      return link.color;
    }

    return 'rgba(148, 163, 184, 0.1)';
  }, [selectedNode, connectedNodeIds]);

  const graphContent = (
    <>
      {/* Header */}
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
          <Button
            size="sm"
            variant="outline"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 py-2">
        <span className="text-xs text-muted-foreground">Légende:</span>
        {Object.entries(nodeLabels).map(([type, label]) => (
          <button
            key={type}
            onClick={() => toggleNodeType(type)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
              visibleTypes[type]
                ? 'opacity-100'
                : 'opacity-40 line-through'
            }`}
            style={{
              backgroundColor: `${nodeSolidColors[type]}20`,
              color: nodeSolidColors[type],
              border: `1px solid ${nodeSolidColors[type]}40`,
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: nodeSolidColors[type] }}
            />
            {label}
          </button>
        ))}
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
        <div className="rounded-md border bg-background/60 p-2 relative">
          {/* Selected node info panel */}
          {selectedNode && (
            <div className="absolute top-4 left-4 z-10 max-w-xs rounded-lg border border-white/20 bg-slate-900/95 p-3 backdrop-blur shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: nodeSolidColors[selectedNode.type] || nodeSolidColors.default }}
                    />
                    <span className="text-xs font-medium text-slate-400">
                      {nodeLabels[selectedNode.type] || selectedNode.type}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-white">{selectedNode.name}</p>
                  {selectedNode.subtitle && (
                    <p className="mt-1 text-xs text-slate-400">{selectedNode.subtitle}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    {connectedNodeIds.size - 1} connexion{connectedNodeIds.size - 1 !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {isLoading && !graphData ? (
            <div className={`flex items-center justify-center ${isFullscreen ? 'h-screen' : 'h-[420px]'}`}>
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredGraphData && isMounted ? (
            <div
              className={`rounded-md overflow-hidden ${isFullscreen ? '' : 'h-[460px]'}`}
              style={{
                background: "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08), transparent 35%), #0f172a",
                height: isFullscreen ? '100%' : undefined,
              }}
            >
              {typeof window !== 'undefined' && (
                <ForceGraph2D
                  ref={fgRef}
                  graphData={filteredGraphData}
                  nodeLabel=""
                  nodeColor="color"
                  nodeVal="val"
                  nodeCanvasObject={nodeCanvasObject}
                  nodeCanvasObjectMode={() => 'replace'}
                  onNodeClick={handleNodeClick}
                  onZoom={handleZoom}
                  linkColor={linkColor}
                  linkWidth="width"
                  linkDirectionalParticles={selectedNode ? 0 : 2}
                  linkDirectionalParticleWidth={2}
                  backgroundColor="transparent"
                  width={dimensions.width}
                  height={dimensions.height}
                  cooldownTicks={100}
                  d3AlphaDecay={0.01}
                  d3VelocityDecay={0.2}
                />
              )}
            </div>
          ) : (
            <div className={`flex items-center justify-center text-sm text-muted-foreground ${isFullscreen ? 'h-screen' : 'h-[420px]'}`}>
              Aucun graphe à afficher pour le moment.
            </div>
          )}
        </div>
      )}
    </>
  );

  // Fullscreen overlay
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900" ref={containerRef}>
        <div className="h-full w-full p-4 flex flex-col space-y-3">
          {graphContent}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4" ref={containerRef}>
      {graphContent}
    </div>
  );
}
