"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ChevronDown,
  Filter,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResponse } from "@/types";

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(
  async () => {
    const THREE = await import("three");
    if (typeof window !== "undefined") {
      if (!(window as any).THREE) {
        (window as any).THREE = Object.assign({}, THREE);
        Object.setPrototypeOf((window as any).THREE, THREE);
      }
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
          utils: { device: {}, coordinates: {} },
        };
      }
    }
    return import("react-force-graph").then((mod) => mod.ForceGraph2D);
  },
  { ssr: false }
);

// ============================================================================
// TYPES
// ============================================================================

type GraphNodeType = "insight" | "entity" | "challenge" | "synthesis" | "insight_type";

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

interface GraphStats {
  insights: number;
  entities: number;
  challenges: number;
  syntheses: number;
  insightTypes: number;
  edges: number;
}

interface GraphPayload {
  nodes: GraphNodeResponse[];
  edges: GraphEdgeResponse[];
  stats: GraphStats;
}

interface FilterOption {
  id: string;
  name: string;
  parentId?: string | null;
  children?: FilterOption[];
}

interface FiltersPayload {
  clients: FilterOption[];
  projects: FilterOption[];
  challenges: FilterOption[];
}

interface ForceGraphNode {
  id: string;
  name: string;
  type: GraphNodeType;
  label: string;
  subtitle?: string;
  color: string;
  size: number;
  x?: number;
  y?: number;
  degree?: number;
}

interface ForceGraphLink {
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
  label: string;
  color: string;
  width: number;
  relationshipType: string;
}

interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

// ============================================================================
// COLOR SCHEME - Based on module-colors.ts
// ============================================================================

// Node colors by type (RGBA for transparency support)
const NODE_COLORS: Record<GraphNodeType | "default", { fill: string; solid: string }> = {
  // Insight: Yellow/Gold (like insight-detection module)
  insight: {
    fill: "rgba(234, 179, 8, 0.9)",    // yellow-500
    solid: "#EAB308",
  },
  // Entity: Cyan/Sky blue (distinctive for concepts/keywords)
  entity: {
    fill: "rgba(14, 165, 233, 0.9)",   // sky-500
    solid: "#0EA5E9",
  },
  // Challenge: Indigo (like challenge-builder module)
  challenge: {
    fill: "rgba(99, 102, 241, 0.9)",   // indigo-500
    solid: "#6366F1",
  },
  // Synthesis: Purple (like models-config module for AI-generated content)
  synthesis: {
    fill: "rgba(168, 85, 247, 0.9)",   // purple-500
    solid: "#A855F7",
  },
  // Insight Type: Rose/Pink (category nodes for insight types)
  insight_type: {
    fill: "rgba(244, 63, 94, 0.9)",    // rose-500
    solid: "#F43F5E",
  },
  default: {
    fill: "rgba(148, 163, 184, 0.9)",  // slate-400
    solid: "#94A3B8",
  },
};

// Edge colors by relationship type
const EDGE_COLORS: Record<string, string> = {
  SIMILAR_TO: "rgba(234, 179, 8, 0.5)",    // yellow - insight similarity
  RELATED_TO: "rgba(99, 102, 241, 0.5)",   // indigo - challenge relations
  MENTIONS: "rgba(14, 165, 233, 0.5)",     // cyan - entity mentions
  SYNTHESIZES: "rgba(168, 85, 247, 0.5)",  // purple - synthesis connections
  CONTAINS: "rgba(16, 185, 129, 0.5)",     // emerald - containment
  HAS_TYPE: "rgba(244, 63, 94, 0.5)",      // rose - insight type classification
  INDIRECT: "rgba(148, 163, 184, 0.35)",   // slate - virtual/indirect links (dashed visually)
  default: "rgba(148, 163, 184, 0.4)",     // slate default
};

// Node labels in French
const NODE_LABELS: Record<GraphNodeType, string> = {
  insight: "Insights",
  entity: "Entités",
  challenge: "Challenges",
  synthesis: "Synthèses",
  insight_type: "Types d'insight",
};

// Base node sizes by type
const NODE_SIZES: Record<GraphNodeType | "default", number> = {
  insight: 5,
  challenge: 7,
  synthesis: 6,
  entity: 4,
  insight_type: 8,  // Larger for category nodes
  default: 4,
};

// ============================================================================
// COMPONENT PROPS
// ============================================================================

interface ProjectGraphVisualizationProps {
  projectId?: string | null;
  clientId?: string | null;
  refreshKey?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
  // Deduplicate entity nodes by normalized label
  const seenLabels = new Map<string, string>();
  const nodeIdMapping = new Map<string, string>();

  for (const node of payload.nodes) {
    if (node.type === "entity") {
      const normalizedLabel = normalizeLabel(node.label);
      const key = `${normalizedLabel}:${node.subtitle || ""}`;
      if (seenLabels.has(key)) {
        nodeIdMapping.set(node.id, seenLabels.get(key)!);
      } else {
        seenLabels.set(key, node.id);
        nodeIdMapping.set(node.id, node.id);
      }
    } else {
      nodeIdMapping.set(node.id, node.id);
    }
  }

  // Calculate node degrees for sizing
  const nodeDegrees = new Map<string, number>();
  for (const edge of payload.edges) {
    const sourceId = nodeIdMapping.get(edge.source) || edge.source;
    const targetId = nodeIdMapping.get(edge.target) || edge.target;
    nodeDegrees.set(sourceId, (nodeDegrees.get(sourceId) || 0) + 1);
    nodeDegrees.set(targetId, (nodeDegrees.get(targetId) || 0) + 1);
  }

  // Build nodes with dynamic sizing based on degree
  const uniqueNodeIds = new Set(nodeIdMapping.values());
  const maxDegree = Math.max(...Array.from(nodeDegrees.values()), 1);

  const nodes: ForceGraphNode[] = payload.nodes
    .filter((node) => uniqueNodeIds.has(node.id) && nodeIdMapping.get(node.id) === node.id)
    .map((node) => {
      const colors = NODE_COLORS[node.type as GraphNodeType] || NODE_COLORS.default;
      const baseSize = NODE_SIZES[node.type as GraphNodeType] || NODE_SIZES.default;
      const degree = nodeDegrees.get(node.id) || 0;

      // Scale size based on degree (1x to 2.5x base size)
      const degreeScale = 1 + (degree / maxDegree) * 1.5;
      const size = baseSize * degreeScale;

      return {
        id: node.id,
        name: node.label,
        type: node.type as GraphNodeType,
        label: node.label,
        subtitle: node.subtitle,
        color: colors.fill,
        size,
        degree,
      };
    });

  // Build deduplicated links
  const seenLinkKeys = new Set<string>();
  const links: ForceGraphLink[] = [];

  for (const edge of payload.edges) {
    const remappedSource = nodeIdMapping.get(edge.source) || edge.source;
    const remappedTarget = nodeIdMapping.get(edge.target) || edge.target;

    if (remappedSource === remappedTarget) continue;

    const linkKey = `${remappedSource}-${remappedTarget}-${edge.relationshipType}`;
    if (seenLinkKeys.has(linkKey)) continue;
    seenLinkKeys.add(linkKey);

    const color = EDGE_COLORS[edge.relationshipType] || EDGE_COLORS.default;
    const weight = edge.weight ?? 0.5;

    links.push({
      source: remappedSource,
      target: remappedTarget,
      label: edge.label || edge.relationshipType,
      color,
      width: Math.max(0.5, weight * 2),
      relationshipType: edge.relationshipType,
    });
  }

  return { nodes, links };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ProjectGraphVisualization({ projectId, clientId, refreshKey }: ProjectGraphVisualizationProps) {
  // State
  const [graphData, setGraphData] = useState<ForceGraphData | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Interaction state
  const [selectedNode, setSelectedNode] = useState<ForceGraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<ForceGraphNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Filter state
  const [visibleTypes, setVisibleTypes] = useState<Record<GraphNodeType, boolean>>({
    insight: true,
    entity: true,
    challenge: true,
    synthesis: true,
    insight_type: true,
  });
  const [filters, setFilters] = useState<FiltersPayload | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    clientId === "all" ? null : (clientId ?? null)
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId ?? null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Semantic search state
  const [isSemanticSearch, setIsSemanticSearch] = useState(false);
  const [semanticResults, setSemanticResults] = useState<Map<string, number> | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Container dimensions for responsive sizing
  const [containerWidth, setContainerWidth] = useState(900);

  // Mount effect
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Track container width with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    // Initial measurement
    setContainerWidth(containerRef.current.offsetWidth || 900);

    return () => resizeObserver.disconnect();
  }, []);

  // Sync selectedProjectId when prop changes
  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
    }
  }, [projectId]);

  // Sync selectedClientId when prop changes
  useEffect(() => {
    // Handle "all" case: clientId prop can be "all" which means no filter
    setSelectedClientId(clientId === "all" ? null : (clientId ?? null));
  }, [clientId]);

  // Semantic search effect with debounce
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Clear results if search is empty or semantic mode is off
    if (!isSemanticSearch || !searchQuery.trim()) {
      setSemanticResults(null);
      setIsSearching(false);
      return;
    }

    // Debounce search - wait 500ms after user stops typing
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/graph/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery,
            searchType: "semantic",
            projectId: projectId,
            limit: 50,
            threshold: 0.6, // Lower threshold to get more results
          }),
        });

        const data = await response.json();

        if (data.success && data.data) {
          // Build map of insight ID -> similarity score
          const resultsMap = new Map<string, number>();
          for (const result of data.data) {
            resultsMap.set(result.id, result.score ?? 0.7);
          }
          setSemanticResults(resultsMap);
        } else {
          setSemanticResults(null);
        }
      } catch (error) {
        console.error("Semantic search error:", error);
        setSemanticResults(null);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, isSemanticSearch, projectId]);

  // ========================================================================
  // COMPUTED VALUES
  // ========================================================================

  // Get connected node IDs for selection highlighting
  const connectedNodeIds = useMemo(() => {
    if (!selectedNode || !graphData) return new Set<string>();
    const connected = new Set<string>([selectedNode.id]);

    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;

      if (sourceId === selectedNode.id) connected.add(targetId);
      if (targetId === selectedNode.id) connected.add(sourceId);
    });

    return connected;
  }, [selectedNode, graphData]);

  // Get connected node IDs for hover highlighting (same focus effect as selection)
  const hoveredConnectedNodeIds = useMemo(() => {
    if (!hoveredNode || !graphData || selectedNode) return new Set<string>();
    const connected = new Set<string>([hoveredNode.id]);

    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;

      if (sourceId === hoveredNode.id) connected.add(targetId);
      if (targetId === hoveredNode.id) connected.add(sourceId);
    });

    return connected;
  }, [hoveredNode, graphData, selectedNode]);

  // Hub detection (nodes with many connections)
  const hubNodeIds = useMemo(() => {
    if (!graphData) return new Set<string>();

    const degrees = new Map<string, number>();
    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;
      degrees.set(sourceId, (degrees.get(sourceId) || 0) + 1);
      degrees.set(targetId, (degrees.get(targetId) || 0) + 1);
    });

    const threshold = 5;
    const hubs = new Set<string>();
    degrees.forEach((degree, nodeId) => {
      if (degree >= threshold) hubs.add(nodeId);
    });

    return hubs;
  }, [graphData]);

  // Search filter - supports both text and semantic search
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim() || !graphData) return null;

    // If semantic search is enabled, use the semantic results
    if (isSemanticSearch && semanticResults) {
      // For semantic search, also include connected entities/challenges via graph links
      const matchedIds = new Set<string>(semanticResults.keys());

      // Expand matches to include directly connected nodes (entities, challenges)
      for (const link of graphData.links) {
        const sourceId = typeof link.source === "string" ? link.source : link.source.id;
        const targetId = typeof link.target === "string" ? link.target : link.target.id;

        if (matchedIds.has(sourceId)) {
          matchedIds.add(targetId);
        }
        if (matchedIds.has(targetId)) {
          matchedIds.add(sourceId);
        }
      }

      return matchedIds;
    }

    // Fallback to text search
    const query = searchQuery.toLowerCase();
    return new Set(
      graphData.nodes
        .filter((n) => n.label.toLowerCase().includes(query) || n.subtitle?.toLowerCase().includes(query))
        .map((n) => n.id)
    );
  }, [searchQuery, graphData, isSemanticSearch, semanticResults]);

  // Filter graph data with virtual links for hidden intermediary nodes
  const filteredGraphData = useMemo(() => {
    if (!graphData) return null;

    // Filter nodes by type visibility and search
    const visibleNodes = graphData.nodes.filter((node) => {
      if (!visibleTypes[node.type]) return false;
      if (searchMatchIds && !searchMatchIds.has(node.id)) return false;
      return true;
    });

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const hiddenNodeIds = new Set(
      graphData.nodes.filter((n) => !visibleNodeIds.has(n.id)).map((n) => n.id)
    );

    // Build adjacency map for hidden nodes to create virtual links
    // When insights are hidden, we want to show direct links between challenges and entities
    const hiddenNodeConnections = new Map<string, Set<string>>();

    // First pass: collect all connections through hidden nodes
    for (const link of graphData.links) {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;

      // If one end is hidden and the other is visible, track the connection
      if (hiddenNodeIds.has(sourceId) && visibleNodeIds.has(targetId)) {
        if (!hiddenNodeConnections.has(sourceId)) {
          hiddenNodeConnections.set(sourceId, new Set());
        }
        hiddenNodeConnections.get(sourceId)!.add(targetId);
      }
      if (hiddenNodeIds.has(targetId) && visibleNodeIds.has(sourceId)) {
        if (!hiddenNodeConnections.has(targetId)) {
          hiddenNodeConnections.set(targetId, new Set());
        }
        hiddenNodeConnections.get(targetId)!.add(sourceId);
      }
    }

    // Create virtual links: connect visible nodes that share a hidden intermediary
    const virtualLinks: ForceGraphLink[] = [];
    const seenVirtualLinks = new Set<string>();

    for (const [_hiddenId, connectedVisibleIds] of hiddenNodeConnections) {
      const visibleArray = Array.from(connectedVisibleIds);
      // Create links between all pairs of visible nodes connected through this hidden node
      for (let i = 0; i < visibleArray.length; i++) {
        for (let j = i + 1; j < visibleArray.length; j++) {
          const nodeA = visibleArray[i];
          const nodeB = visibleArray[j];

          // Create a consistent key regardless of order
          const linkKey = nodeA < nodeB ? `${nodeA}-${nodeB}` : `${nodeB}-${nodeA}`;

          if (!seenVirtualLinks.has(linkKey)) {
            seenVirtualLinks.add(linkKey);

            // Determine link color based on connected node types
            const nodeAType = graphData.nodes.find((n) => n.id === nodeA)?.type;
            const nodeBType = graphData.nodes.find((n) => n.id === nodeB)?.type;

            let color = EDGE_COLORS.default;
            if (nodeAType === "challenge" || nodeBType === "challenge") {
              color = EDGE_COLORS.RELATED_TO;
            } else if (nodeAType === "entity" || nodeBType === "entity") {
              color = EDGE_COLORS.MENTIONS;
            }

            virtualLinks.push({
              source: nodeA,
              target: nodeB,
              label: "Lien indirect",
              color,
              width: 0.8,
              relationshipType: "INDIRECT",
            });
          }
        }
      }
    }

    // Filter original links (only between visible nodes)
    const directLinks = graphData.links.filter((link) => {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });

    // Combine direct and virtual links, avoiding duplicates
    const allLinks = [...directLinks];
    for (const vLink of virtualLinks) {
      const sourceId = typeof vLink.source === "string" ? vLink.source : vLink.source.id;
      const targetId = typeof vLink.target === "string" ? vLink.target : vLink.target.id;

      // Check if a direct link already exists
      const exists = directLinks.some((dLink) => {
        const dSourceId = typeof dLink.source === "string" ? dLink.source : dLink.source.id;
        const dTargetId = typeof dLink.target === "string" ? dLink.target : dLink.target.id;
        return (dSourceId === sourceId && dTargetId === targetId) ||
               (dSourceId === targetId && dTargetId === sourceId);
      });

      if (!exists) {
        allLinks.push(vLink);
      }
    }

    return { nodes: visibleNodes, links: allLinks };
  }, [graphData, visibleTypes, searchMatchIds]);

  // Dimensions - responsive to container width
  const dimensions = useMemo(() => {
    if (isFullscreen) {
      return {
        width: typeof window !== "undefined" ? window.innerWidth : 1200,
        height: typeof window !== "undefined" ? window.innerHeight : 800,
      };
    }
    // Use container width, with a reasonable height ratio
    return { width: containerWidth, height: 500 };
  }, [isFullscreen, containerWidth]);

  // ========================================================================
  // DATA LOADING
  // ========================================================================

  const loadGraph = useCallback(async () => {
    // Use selectedProjectId (which can be set from prop or user selection)
    const effectiveProjectId = selectedProjectId || projectId;
    // Use selectedClientId (which can be set from prop or user selection)
    const effectiveClientId = selectedClientId;

    // Need at least a project or client to filter by
    if (!effectiveProjectId && !effectiveClientId) {
      setError("Sélectionnez un projet ou un client pour afficher le graphe.");
      setGraphData(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build URL with filters
      const params = new URLSearchParams({ limit: "500" });
      if (effectiveProjectId) params.set("projectId", effectiveProjectId);
      if (effectiveClientId) params.set("clientId", effectiveClientId);
      if (selectedChallengeId) params.set("challengeId", selectedChallengeId);

      const response = await fetch(`/api/admin/graph/visualization?${params}`, {
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
  }, [projectId, selectedProjectId, selectedClientId, selectedChallengeId]);

  const loadFilters = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/graph/filters");
      const payload: ApiResponse<FiltersPayload> = await response.json();
      if (payload.success && payload.data) {
        setFilters(payload.data);
      }
    } catch (err) {
      console.error("Error loading filters:", err);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph, refreshKey]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  // ========================================================================
  // FORCE GRAPH CONFIGURATION
  // ========================================================================

  useEffect(() => {
    if (fgRef.current && filteredGraphData) {
      // Configure forces for better layout
      fgRef.current.d3Force("charge")?.strength(-400);
      fgRef.current.d3Force("link")?.distance(80);
      fgRef.current.d3Force("center")?.strength(0.05);
    }
  }, [filteredGraphData]);

  // ========================================================================
  // EVENT HANDLERS
  // ========================================================================

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : (node as ForceGraphNode)));
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node as ForceGraphNode | null);
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? "pointer" : "default";
    }
  }, []);

  const handleZoom = useCallback((transform: { k: number }) => {
    setZoomLevel(transform.k);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
    setSelectedNode(null);
  }, []);

  const toggleNodeType = useCallback((type: GraphNodeType) => {
    setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const zoomIn = useCallback(() => {
    fgRef.current?.zoom(zoomLevel * 1.3, 300);
  }, [zoomLevel]);

  const zoomOut = useCallback(() => {
    fgRef.current?.zoom(zoomLevel / 1.3, 300);
  }, [zoomLevel]);

  const resetZoom = useCallback(() => {
    fgRef.current?.zoomToFit(400, 50);
  }, []);

  // Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedNode) {
          setSelectedNode(null);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, selectedNode]);

  // ========================================================================
  // CANVAS RENDERING
  // ========================================================================

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as ForceGraphNode;
      const isSelected = selectedNode?.id === n.id;
      const isHovered = hoveredNode?.id === n.id;
      const isConnected = selectedNode ? connectedNodeIds.has(n.id) : true;
      const isHoverConnected = hoveredNode && !selectedNode ? hoveredConnectedNodeIds.has(n.id) : true;
      const isHub = hubNodeIds.has(n.id);
      const isSearchMatch = searchMatchIds ? searchMatchIds.has(n.id) : true;

      // Determine opacity - apply focus effect on both selection and hover
      let alpha = 1;
      if (selectedNode && !isConnected) alpha = 0.15;
      else if (hoveredNode && !selectedNode && !isHoverConnected) alpha = 0.15;
      if (searchMatchIds && !isSearchMatch) alpha = 0.1;

      // Parse color and apply alpha
      let fillColor = n.color;
      if (alpha < 1) {
        fillColor = n.color.replace(/[\d.]+\)$/, `${alpha * 0.6})`);
      }

      // Draw node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, n.size, 0, 2 * Math.PI, false);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Selection/hover ring
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255,255,255,0.6)";
        ctx.lineWidth = isSelected ? 2.5 / globalScale : 1.5 / globalScale;
        ctx.stroke();
      }

      // Search highlight ring - purple for semantic, yellow for text search
      if (searchMatchIds && isSearchMatch && !isSelected && !isHovered) {
        const semanticScore = semanticResults?.get(n.id);
        if (isSemanticSearch && semanticScore !== undefined) {
          // Purple ring for semantic matches, intensity based on score
          ctx.strokeStyle = `rgba(168, 85, 247, ${0.5 + semanticScore * 0.5})`;
          ctx.lineWidth = (1.5 + semanticScore * 1.5) / globalScale;
        } else {
          ctx.strokeStyle = "rgba(251, 191, 36, 0.8)";
          ctx.lineWidth = 2 / globalScale;
        }
        ctx.stroke();
      }

      // Label visibility based on zoom level
      // Level 1 (zoom < 0.4): Only selected/hovered
      // Level 2 (zoom 0.4-0.8): + hubs and challenges
      // Level 3 (zoom 0.8-1.5): + insights and syntheses with high degree
      // Level 4 (zoom > 1.5): All labels
      const ZOOM_L1 = 0.4;
      const ZOOM_L2 = 0.8;
      const ZOOM_L3 = 1.5;

      let showLabel = false;
      if (isSelected || isHovered) {
        showLabel = true;
      } else if (selectedNode && isConnected) {
        showLabel = globalScale > ZOOM_L1;
      } else if (hoveredNode && !selectedNode && isHoverConnected) {
        // Show labels for connected nodes on hover (same as selection)
        showLabel = globalScale > ZOOM_L1;
      } else if (globalScale >= ZOOM_L3) {
        showLabel = true;
      } else if (globalScale >= ZOOM_L2) {
        showLabel = isHub || n.type === "challenge" || n.type === "synthesis" || (n.degree || 0) >= 3;
      } else if (globalScale >= ZOOM_L1) {
        showLabel = isHub || n.type === "challenge";
      }

      if (!showLabel || alpha < 0.3) return;

      // Draw label
      const label = n.name;
      const fontSize = Math.min(5, Math.max(2.5, 4 / globalScale));
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;

      // Word wrap
      const maxWidth = 100 / globalScale;
      const words = label.split(" ");
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      // Limit lines - show full text when hovered
      const maxLines = isHovered ? lines.length : 3;
      const displayLines = lines.slice(0, maxLines);
      if (!isHovered && lines.length > 3) {
        displayLines[2] = displayLines[2].slice(0, -3) + "...";
      }

      const lineHeight = fontSize * 1.3;
      const maxTextWidth = Math.max(...displayLines.map((l) => ctx.measureText(l).width));
      const boxPadding = fontSize * 0.4;
      const boxWidth = maxTextWidth + boxPadding * 2;
      const boxHeight = displayLines.length * lineHeight + boxPadding;
      const boxX = node.x - boxWidth / 2;
      const boxY = node.y + n.size + 2;
      const borderRadius = fontSize * 0.3;

      // Background
      ctx.fillStyle = `rgba(15, 23, 42, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
      ctx.fill();

      // Text
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(226, 232, 240, ${alpha})`;
      displayLines.forEach((line, i) => {
        const lineY = boxY + boxPadding / 2 + (i + 0.5) * lineHeight;
        ctx.fillText(line, node.x, lineY);
      });
    },
    [selectedNode, hoveredNode, connectedNodeIds, hoveredConnectedNodeIds, hubNodeIds, searchMatchIds, semanticResults, isSemanticSearch]
  );

  const linkColor = useCallback(
    (link: any) => {
      const sourceId = typeof link.source === "string" ? link.source : link.source.id;
      const targetId = typeof link.target === "string" ? link.target : link.target.id;

      // Selection takes priority
      if (selectedNode) {
        if (connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId)) {
          return link.color;
        }
        return "rgba(148, 163, 184, 0.08)";
      }

      // Hover effect - same focus behavior as selection
      if (hoveredNode) {
        if (hoveredConnectedNodeIds.has(sourceId) && hoveredConnectedNodeIds.has(targetId)) {
          return link.color;
        }
        return "rgba(148, 163, 184, 0.08)";
      }

      return link.color;
    },
    [selectedNode, connectedNodeIds, hoveredNode, hoveredConnectedNodeIds]
  );

  // ========================================================================
  // RENDER
  // ========================================================================

  const graphContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-yellow-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Graphe de connaissances</h3>
            <p className="text-xs text-slate-400">
              Visualisation des relations entre insights, entités et challenges
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats && (
            <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
              <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-300">
                {stats.insights} insights
              </span>
              <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-sky-300">
                {stats.entities} entités
              </span>
              <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-300">
                {stats.challenges} challenges
              </span>
              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">
                {stats.insightTypes} types
              </span>
              <span className="text-slate-500">•</span>
              <span>{stats.edges} liens</span>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-slate-600/50 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60"
            onClick={loadGraph}
            disabled={isLoading || !projectId}
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-slate-600/50 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Toolbar: Search + Filters + Legend */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/50 px-4 py-2">
        {/* Search with semantic toggle */}
        <div className="flex items-center gap-1">
          <div className="relative">
            {isSearching ? (
              <Loader2 className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-purple-400" />
            ) : isSemanticSearch ? (
              <Sparkles className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-purple-400" />
            ) : (
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            )}
            <input
              type="text"
              placeholder={isSemanticSearch ? "Recherche sémantique..." : "Rechercher..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`h-8 w-48 rounded-md border bg-slate-800/60 pl-8 pr-8 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 ${
                isSemanticSearch
                  ? "border-purple-500/50 focus:border-purple-500/70 focus:ring-purple-500/30"
                  : "border-slate-600/50 focus:border-yellow-500/50 focus:ring-yellow-500/30"
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Semantic search toggle */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsSemanticSearch(!isSemanticSearch)}
            title={isSemanticSearch ? "Recherche sémantique (IA)" : "Recherche textuelle"}
            className={`h-8 w-8 p-0 ${
              isSemanticSearch
                ? "border-purple-500/50 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                : "border-slate-600/50 bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Semantic search results count */}
        {isSemanticSearch && semanticResults && searchQuery && (
          <span className="text-xs text-purple-300">
            {semanticResults.size} résultat{semanticResults.size !== 1 ? "s" : ""} sémantique{semanticResults.size !== 1 ? "s" : ""}
          </span>
        )}

        {/* Filter toggle */}
        <Button
          size="sm"
          variant="outline"
          className={`gap-1.5 border-slate-600/50 text-xs ${
            showFilters || selectedClientId || selectedChallengeId
              ? "bg-yellow-500/20 text-yellow-300"
              : "bg-slate-800/60 text-slate-300"
          }`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-3 w-3" />
          Filtres
          {(selectedClientId || selectedChallengeId) && (
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-yellow-400" />
          )}
        </Button>

        {/* Divider */}
        <div className="h-4 w-px bg-slate-600/50" />

        {/* Legend */}
        {Object.entries(NODE_LABELS).map(([type, label]) => (
          <button
            key={type}
            onClick={() => toggleNodeType(type as GraphNodeType)}
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-all ${
              visibleTypes[type as GraphNodeType] ? "opacity-100" : "opacity-40 line-through"
            }`}
            style={{
              backgroundColor: `${NODE_COLORS[type as GraphNodeType].solid}20`,
              color: NODE_COLORS[type as GraphNodeType].solid,
              border: `1px solid ${NODE_COLORS[type as GraphNodeType].solid}40`,
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: NODE_COLORS[type as GraphNodeType].solid }}
            />
            {label}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      {showFilters && filters && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-700/50 bg-slate-800/30 px-4 py-3">
          {/* Client filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Client:</label>
            <select
              value={selectedClientId || ""}
              onChange={(e) => {
                setSelectedClientId(e.target.value || null);
                setSelectedProjectId(null);
                setSelectedChallengeId(null);
              }}
              className="h-7 rounded border border-slate-600/50 bg-slate-800 px-2 text-xs text-white focus:border-yellow-500/50 focus:outline-none"
            >
              <option value="">Tous</option>
              {filters.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Project filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Projet:</label>
            <select
              value={selectedProjectId || ""}
              onChange={(e) => {
                setSelectedProjectId(e.target.value || null);
                setSelectedChallengeId(null);
              }}
              className="h-7 rounded border border-slate-600/50 bg-slate-800 px-2 text-xs text-white focus:border-yellow-500/50 focus:outline-none"
            >
              <option value="">Tous</option>
              {filters.projects
                .filter((p) => !selectedClientId || p.parentId === selectedClientId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Challenge filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Challenge:</label>
            <select
              value={selectedChallengeId || ""}
              onChange={(e) => setSelectedChallengeId(e.target.value || null)}
              className="h-7 rounded border border-slate-600/50 bg-slate-800 px-2 text-xs text-white focus:border-yellow-500/50 focus:outline-none"
            >
              <option value="">Tous</option>
              {filters.challenges
                .filter((c) => !selectedProjectId || c.parentId === selectedProjectId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Clear filters */}
          {(selectedClientId || selectedProjectId || selectedChallengeId) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-slate-400 hover:text-white"
              onClick={() => {
                setSelectedClientId(null);
                setSelectedProjectId(null);
                setSelectedChallengeId(null);
              }}
            >
              <X className="h-3 w-3" />
              Effacer
            </Button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mx-4 mt-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Graph area */}
      <div className="relative flex-1" ref={containerRef}>
        {!projectId && !clientId && !selectedProjectId && !selectedClientId && (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-lg border border-dashed border-slate-600/50 bg-slate-800/40 px-8 py-12 text-center">
              <Layers className="mx-auto mb-3 h-10 w-10 text-slate-500" />
              <p className="text-sm text-slate-400">Sélectionnez un client ou un projet pour afficher le graphe de connaissances</p>
            </div>
          </div>
        )}

        {(projectId || clientId || selectedProjectId || selectedClientId) && isLoading && !graphData && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-yellow-500/50" />
          </div>
        )}

        {(projectId || clientId || selectedProjectId || selectedClientId) && filteredGraphData && isMounted && (
          <>
            {/* Selected node info */}
            {selectedNode && (
              <div className="absolute left-4 top-4 z-10 max-w-xs rounded-lg border border-white/20 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: NODE_COLORS[selectedNode.type]?.solid || NODE_COLORS.default.solid }}
                      />
                      <span className="text-xs font-medium text-slate-400">
                        {NODE_LABELS[selectedNode.type] || selectedNode.type}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-white">{selectedNode.name}</p>
                    {selectedNode.subtitle && <p className="mt-1 text-xs text-slate-400">{selectedNode.subtitle}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                      {connectedNodeIds.size - 1} connexion{connectedNodeIds.size - 1 !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white flex items-center gap-1 text-xs">
                    <X className="h-4 w-4" />
                    <span>Fermer</span>
                  </button>
                </div>
              </div>
            )}

            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-slate-600/50 bg-slate-800/80 px-2 text-slate-300 hover:bg-slate-700/80"
                onClick={zoomIn}
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="text-xs">Zoom +</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-slate-600/50 bg-slate-800/80 px-2 text-slate-300 hover:bg-slate-700/80"
                onClick={zoomOut}
              >
                <Minus className="h-4 w-4 mr-1" />
                <span className="text-xs">Zoom -</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-slate-600/50 bg-slate-800/80 px-2 text-xs text-slate-300 hover:bg-slate-700/80"
                onClick={resetZoom}
                title="Réinitialiser le zoom"
              >
                <ZoomOut className="h-4 w-4 mr-1" />
                <span className="text-xs">Reset</span>
              </Button>
              <div className="mt-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-center text-[10px] text-slate-400">
                {Math.round(zoomLevel * 100)}%
              </div>
            </div>

            {/* Graph */}
            <div
              className="h-full w-full"
              style={{
                background: "radial-gradient(ellipse at 30% 20%, rgba(234, 179, 8, 0.05) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(99, 102, 241, 0.05) 0%, transparent 50%), #0f172a",
              }}
            >
              {typeof window !== "undefined" && (
                <ForceGraph2D
                  ref={fgRef}
                  graphData={filteredGraphData}
                  width={dimensions.width}
                  height={dimensions.height}
                  nodeLabel=""
                  nodeCanvasObject={nodeCanvasObject}
                  nodeCanvasObjectMode={() => "replace"}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  onBackgroundClick={handleBackgroundClick}
                  onZoom={handleZoom}
                  linkColor={linkColor}
                  linkWidth={(link: any) => link.width}
                  linkDirectionalParticles={selectedNode ? 0 : 1}
                  linkDirectionalParticleWidth={1.5}
                  linkDirectionalParticleSpeed={0.003}
                  backgroundColor="transparent"
                  cooldownTicks={150}
                  d3AlphaDecay={0.02}
                  d3VelocityDecay={0.25}
                  warmupTicks={50}
                  minZoom={0.1}
                  maxZoom={8}
                />
              )}
            </div>
          </>
        )}

        {projectId && !isLoading && (!filteredGraphData || filteredGraphData.nodes.length === 0) && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Layers className="mx-auto mb-3 h-10 w-10 text-slate-500" />
              <p className="text-sm text-slate-400">Aucune donnée à afficher</p>
              <p className="text-xs text-slate-500">Le graphe est vide ou filtré</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900" ref={containerRef}>
        {graphContent}
      </div>
    );
  }

  // Normal mode
  return (
    <div
      ref={containerRef}
      className="h-[600px] overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/60 backdrop-blur"
    >
      {graphContent}
    </div>
  );
}
