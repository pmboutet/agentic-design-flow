"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  type AskSessionRecord,
  type ChallengeRecord,
  type ProjectRecord
} from "@/types";

type LayoutNodeType = "project" | "challenge" | "ask";

interface LayoutNode {
  id: string;
  entityId: string;
  type: LayoutNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  subtitle?: string;
  status?: string | null;
  meta?: string;
  projectId?: string;
  challengeId?: string;
  askId?: string;
  depth: number;
}

interface LayoutEdge {
  id: string;
  from: string;
  to: string;
}

interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

interface AskRelationshipCanvasProps {
  projects: ProjectRecord[];
  challenges: ChallengeRecord[];
  asks: AskSessionRecord[];
  focusProjectId?: string | null;
  focusChallengeId?: string | null;
  focusAskId?: string | null;
  onProjectSelect?: (projectId: string) => void;
  onChallengeSelect?: (challengeId: string) => void;
  onAskSelect?: (askId: string) => void;
}
const PROJECT_NODE = { width: 260, height: 104 } as const;
const CHALLENGE_NODE = { width: 240, height: 92 } as const;
const ASK_NODE = { width: 220, height: 84 } as const;

const PROJECT_COLUMN_GAP = 420;
const LEVEL_GAP_X = 220;
const ROW_GAP_Y = 150;
const ASK_GAP_Y = 120;

const INITIAL_MARGIN_X = 160;
const INITIAL_MARGIN_Y = 120;

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.8;

function getParentChallengeId(challenge: ChallengeRecord): string | null {
  const candidate =
    (challenge as ChallengeRecord & { parentChallengeId?: string | null }).parentChallengeId ??
    (challenge as ChallengeRecord & { parentId?: string | null }).parentId ??
    (challenge as ChallengeRecord & { parent?: string | null }).parent ??
    null;

  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : null;
}

function formatDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("fr", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

function buildLayout(
  projects: ProjectRecord[],
  challenges: ChallengeRecord[],
  asks: AskSessionRecord[]
): LayoutResult {
  if (projects.length === 0 && challenges.length === 0 && asks.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  const askByChallenge = new Map<string, AskSessionRecord[]>();
  for (const ask of asks) {
    if (!ask.challengeId) {
      continue;
    }
    const list = askByChallenge.get(ask.challengeId) ?? [];
    list.push(ask);
    askByChallenge.set(ask.challengeId, list);
  }

  const challengesByProject = new Map<string, ChallengeRecord[]>();
  for (const challenge of challenges) {
    if (!challenge.projectId) {
      continue;
    }
    const list = challengesByProject.get(challenge.projectId) ?? [];
    list.push(challenge);
    challengesByProject.set(challenge.projectId, list);
  }

  const relevantProjects = projects
    .filter(project => challengesByProject.has(project.id) || asks.some(ask => ask.projectId === project.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (relevantProjects.length === 0 && projects.length > 0) {
    relevantProjects.push(...projects.slice(0, 4));
  }

  const projectPositions = new Map<string, number>();

  relevantProjects.forEach((project, index) => {
    const baseX = INITIAL_MARGIN_X + index * PROJECT_COLUMN_GAP;
    projectPositions.set(project.id, baseX);

    const projectChallenges = (challengesByProject.get(project.id) ?? []).sort((a, b) => {
      const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return dueA - dueB;
    });

    const askCount = asks.filter(ask => ask.projectId === project.id).length;

    const projectNode: LayoutNode = {
      id: `project-${project.id}`,
      entityId: project.id,
      type: "project",
      x: baseX,
      y: INITIAL_MARGIN_Y,
      width: PROJECT_NODE.width,
      height: PROJECT_NODE.height,
      label: project.name,
      subtitle: project.description ?? undefined,
      status: project.status,
      meta: `${projectChallenges.length} challenge${projectChallenges.length === 1 ? "" : "s"} • ${askCount} ASK${
        askCount === 1 ? "" : "s"
      }`,
      projectId: project.id,
      depth: 0
    };

    nodes.push(projectNode);

    if (projectChallenges.length === 0) {
      return;
    }

    const challengeChildren = new Map<string | null, ChallengeRecord[]>();
    for (const challenge of projectChallenges) {
      const parentId = getParentChallengeId(challenge);
      const normalizedParent =
        parentId && projectChallenges.some(item => item.id === parentId) ? parentId : null;
      const list = challengeChildren.get(normalizedParent) ?? [];
      list.push(challenge);
      challengeChildren.set(normalizedParent, list);
    }

    challengeChildren.forEach(childList => {
      childList.sort((a, b) => a.name.localeCompare(b.name));
    });

    let cursorY = projectNode.y + projectNode.height + 48;

    const placeChallenge = (challenge: ChallengeRecord, depth: number, parentNodeId: string) => {
      const dueLabel = formatDate(challenge.dueDate);
      const challengeNode: LayoutNode = {
        id: `challenge-${challenge.id}`,
        entityId: challenge.id,
        type: "challenge",
        x: baseX + depth * LEVEL_GAP_X,
        y: cursorY,
        width: CHALLENGE_NODE.width,

        height: CHALLENGE_NODE.height,
        label: challenge.name,
        subtitle: challenge.description ?? undefined,
        status: challenge.status,
        meta: dueLabel ? `Échéance ${dueLabel}` : undefined,
        projectId: project.id,
        challengeId: challenge.id,
        depth
      };

      nodes.push(challengeNode);
      edges.push({ id: `${parentNodeId}->${challengeNode.id}`, from: parentNodeId, to: challengeNode.id });
      cursorY += ROW_GAP_Y;
      let localBottom = challengeNode.y + challengeNode.height;

      const askSessions = (askByChallenge.get(challenge.id) ?? []).sort((a, b) => {
        const startA = new Date(a.startDate).getTime();
        const startB = new Date(b.startDate).getTime();
        return startA - startB;
      });

      askSessions.forEach((ask, index) => {
        const askNodeY = localBottom + 32 + index * ASK_GAP_Y;
        const askNode: LayoutNode = {
          id: `ask-${ask.id}`,
          entityId: ask.id,
          type: "ask",
          x: challengeNode.x + LEVEL_GAP_X,
          y: askNodeY,
          width: ASK_NODE.width,
          height: ASK_NODE.height,
          label: ask.name,
          subtitle: ask.question,
          status: ask.status,
          meta: `${formatDate(ask.startDate) ?? ""} → ${formatDate(ask.endDate) ?? ""}`.trim(),
          projectId: ask.projectId,
          challengeId: ask.challengeId ?? undefined,
          askId: ask.id,
          depth: depth + 1
        };

        nodes.push(askNode);
        edges.push({ id: `${challengeNode.id}->${askNode.id}`, from: challengeNode.id, to: askNode.id });
        localBottom = Math.max(localBottom, askNode.y + askNode.height);
      });
      const childChallenges = challengeChildren.get(challenge.id) ?? [];

      childChallenges.forEach(child => {
        cursorY = Math.max(cursorY, localBottom + 48);
        const childBottom = placeChallenge(child, depth + 1, challengeNode.id);
        localBottom = Math.max(localBottom, childBottom);
      });

      cursorY = Math.max(cursorY, localBottom + ROW_GAP_Y);
      return localBottom;
    };

    const rootChallenges = challengeChildren.get(null) ?? [];
    rootChallenges.forEach(challenge => {
      cursorY = Math.max(cursorY, projectNode.y + projectNode.height + 48);
      placeChallenge(challenge, 1, projectNode.id);
    });
  });

  return { nodes, edges };
}

export function AskRelationshipCanvas({
  projects,
  challenges,
  asks,
  focusProjectId,
  focusChallengeId,
  focusAskId,
  onProjectSelect,
  onChallengeSelect,
  onAskSelect

}: AskRelationshipCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 0.9 });
  const [hasInteracted, setHasInteracted] = useState(false);
  const [forceCenterKey, setForceCenterKey] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const { nodes, edges } = useMemo(() => buildLayout(projects, challenges, asks), [projects, challenges, asks]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [nodes]);

  const focusNode = useMemo(() => {
    if (focusAskId) {
      const node = nodes.find(item => item.askId === focusAskId);

      if (node) {
        return node;
      }
    }
    if (focusChallengeId) {
      const node = nodes.find(item => item.challengeId === focusChallengeId && item.type === "challenge");
      if (node) {
        return node;
      }
    }
    if (focusProjectId) {
      const node = nodes.find(item => item.projectId === focusProjectId && item.type === "project");
      if (node) {
        return node;
      }
    }
    return null;
  }, [focusAskId, focusChallengeId, focusProjectId, nodes]);

  const layoutBounds = useMemo(() => {
    if (nodes.length === 0) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x + node.width);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + node.height);
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: minX + (maxX - minX) / 2,
      centerY: minY + (maxY - minY) / 2
    };
  }, [nodes]);

  const canvasWidth = useMemo(() => {
    if (!layoutBounds) {
      return 1600;
    }
    return Math.max(layoutBounds.maxX + 480, 1600);
  }, [layoutBounds]);

  const canvasHeight = useMemo(() => {
    if (!layoutBounds) {
      return 1200;
    }
    return Math.max(layoutBounds.maxY + 480, 1200);
  }, [layoutBounds]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const target = focusNode ?? null;
    const targetWidth = target?.width ?? layoutBounds?.width ?? canvasWidth;
    const targetHeight = target?.height ?? layoutBounds?.height ?? canvasHeight;
    const targetCenterX = target ? target.x + target.width / 2 : layoutBounds?.centerX ?? canvasWidth / 2;
    const targetCenterY = target ? target.y + target.height / 2 : layoutBounds?.centerY ?? canvasHeight / 2;

    const scalePadding = target ? 320 : 520;
    const scaleX = rect.width / (targetWidth + scalePadding);
    const scaleY = rect.height / (targetHeight + scalePadding);
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(scaleX, scaleY)));

    const nextX = rect.width / 2 - targetCenterX * nextScale;
    const nextY = rect.height / 2 - targetCenterY * nextScale;

    setViewport({ x: nextX, y: nextY, scale: nextScale });
  }, [focusNode, layoutBounds, nodes.length, canvasWidth, canvasHeight, forceCenterKey]);

  interface PointerState {
    isPanning: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    activePointers: Map<number, { x: number; y: number }>;
    isPinching: boolean;
    initialPinchDistance: number;
    initialPinchScale: number;
    pinchCenterScreen: { x: number; y: number } | null;
    pinchCenterWorld: { x: number; y: number } | null;
  }

  const pointerState = useRef<PointerState>({
    isPanning: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    activePointers: new Map(),
    isPinching: false,
    initialPinchDistance: 0,
    initialPinchScale: 1,
    pinchCenterScreen: null,
    pinchCenterWorld: null
  });

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointerState.current;

    if (event.pointerType === "touch") {
      setHasInteracted(true);
      state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (state.activePointers.size === 1) {
        state.isPanning = true;
        state.startX = event.clientX;
        state.startY = event.clientY;
        state.originX = viewport.x;
        state.originY = viewport.y;
      } else if (state.activePointers.size === 2) {
        const pointers = Array.from(state.activePointers.values());
        const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
        state.isPinching = distance > 0;
        state.isPanning = false;
        state.initialPinchDistance = distance;
        state.initialPinchScale = viewport.scale;

        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const centerClientX = (pointers[0].x + pointers[1].x) / 2;
          const centerClientY = (pointers[0].y + pointers[1].y) / 2;
          const centerX = centerClientX - rect.left;
          const centerY = centerClientY - rect.top;
          state.pinchCenterScreen = { x: centerX, y: centerY };
          state.pinchCenterWorld = {
            x: (centerX - viewport.x) / viewport.scale,
            y: (centerY - viewport.y) / viewport.scale
          };
        } else {
          state.pinchCenterScreen = null;
          state.pinchCenterWorld = null;
        }
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    setHasInteracted(true);
    state.activePointers.clear();
    state.isPinching = false;
    state.pinchCenterScreen = null;
    state.pinchCenterWorld = null;
    state.isPanning = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.originX = viewport.x;
    state.originY = viewport.y;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointerState.current;

    if (event.pointerType === "touch") {
      if (!state.activePointers.has(event.pointerId)) {
        return;
      }

      state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (state.isPinching && state.activePointers.size >= 2 && state.initialPinchDistance > 0) {
        const pointers = Array.from(state.activePointers.values()).slice(0, 2);
        const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
        if (distance === 0) {
          return;
        }

        const rect = containerRef.current?.getBoundingClientRect();
        const centerClientX = (pointers[0].x + pointers[1].x) / 2;
        const centerClientY = (pointers[0].y + pointers[1].y) / 2;
        const centerX = rect ? centerClientX - rect.left : state.pinchCenterScreen?.x ?? 0;
        const centerY = rect ? centerClientY - rect.top : state.pinchCenterScreen?.y ?? 0;

        const scaleFactor = distance / state.initialPinchDistance;
        let nextScale = state.initialPinchScale * scaleFactor;
        nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));

        const anchorWorld = state.pinchCenterWorld;

        setViewport(prev => {
          const world = anchorWorld ?? {
            x: (centerX - prev.x) / prev.scale,
            y: (centerY - prev.y) / prev.scale
          };

          return {
            scale: nextScale,
            x: centerX - world.x * nextScale,
            y: centerY - world.y * nextScale
          };
        });

        state.pinchCenterScreen = { x: centerX, y: centerY };
        return;
      }

      if (state.isPanning) {
        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        setViewport(prev => ({ ...prev, x: state.originX + deltaX, y: state.originY + deltaY }));
      }

      return;
    }

    if (!state.isPanning) {
      return;
    }
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    setViewport(prev => ({ ...prev, x: state.originX + deltaX, y: state.originY + deltaY }));
  };

  const stopPanning = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointerState.current;

    if (event.pointerType === "touch") {
      state.activePointers.delete(event.pointerId);

      if (state.activePointers.size < 2) {
        state.isPinching = false;
        state.initialPinchDistance = 0;
        state.pinchCenterScreen = null;
        state.pinchCenterWorld = null;
      }

      if (state.activePointers.size === 1) {
        const remaining = state.activePointers.values().next().value;
        state.isPanning = true;
        state.startX = remaining.x;
        state.startY = remaining.y;
        state.originX = viewport.x;
        state.originY = viewport.y;
      } else {
        state.isPanning = false;
      }

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore release errors if pointer capture was not set
      }

      return;
    }

    if (!state.isPanning) {
      return;
    }
    state.isPanning = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore release errors if pointer capture was not set
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setHasInteracted(true);
    const { deltaY } = event;
    const direction = deltaY > 0 ? -1 : 1;

    setViewport(prev => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale + direction * 0.08));
      if (newScale === prev.scale) {
        return prev;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return { ...prev, scale: newScale };
      }

      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const worldX = (cursorX - prev.x) / prev.scale;
      const worldY = (cursorY - prev.y) / prev.scale;

      return {
        scale: newScale,
        x: cursorX - worldX * newScale,
        y: cursorY - worldY * newScale
      };
    });
  };

  const handleResetView = () => {
    setHasInteracted(false);
    setForceCenterKey(key => key + 1);
  };

  const minimap = useMemo(() => {
    if (!layoutBounds) {
      return null;
    }
    const minimapSize = 200;
    const scale = Math.min(
      minimapSize / Math.max(layoutBounds.width, 1),
      minimapSize / Math.max(layoutBounds.height, 1)
    );
    const offsetX = layoutBounds.minX;
    const offsetY = layoutBounds.minY;

    const worldViewWidth = containerSize.width / viewport.scale;
    const worldViewHeight = containerSize.height / viewport.scale;
    const worldViewX = -viewport.x / viewport.scale;
    const worldViewY = -viewport.y / viewport.scale;

    return {
      scale,
      offsetX,
      offsetY,
      viewRect: {
        x: (worldViewX - offsetX) * scale,
        y: (worldViewY - offsetY) * scale,
        width: worldViewWidth * scale,
        height: worldViewHeight * scale
      }
    };
  }, [layoutBounds, containerSize, viewport]);

  const handleMiniMapPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!minimap || !layoutBounds) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    setHasInteracted(true);

    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const targetWorldX = localX / minimap.scale + minimap.offsetX;
    const targetWorldY = localY / minimap.scale + minimap.offsetY;

    setViewport(prev => ({
      ...prev,
      x: containerSize.width / 2 - targetWorldX * prev.scale,
      y: containerSize.height / 2 - targetWorldY * prev.scale
    }));
  };

  const handleNodeClick = (node: LayoutNode) => {
    if (node.type === "project" && node.projectId) {
      onProjectSelect?.(node.projectId);
    }
    if (node.type === "challenge" && node.challengeId) {
      onChallengeSelect?.(node.challengeId);
    }
    if (node.type === "ask" && node.askId) {
      onAskSelect?.(node.askId);
    }

  };

  if (nodes.length === 0) {
    return (
      <div className="relative flex h-[420px] w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-slate-950/70 text-center text-sm text-slate-400">
        <p>Pas encore de challenges ou d'ASK à cartographier.</p>
        <p className="mt-2 text-xs text-slate-500">Créez des challenges et des sessions ASK pour voir leur relation ici.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[520px] w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-inner"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerLeave={stopPanning}
      onPointerCancel={stopPanning}
      onWheel={handleWheel}
    >
      <motion.div
        className="absolute left-0 top-0"
        style={{ x: viewport.x, y: viewport.y, scale: viewport.scale, transformOrigin: "0 0" }}
        transition={{ type: "spring", stiffness: 120, damping: 20, mass: 0.9 }}
      >
        <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(148,163,184,0.18)_1px,transparent_0)] opacity-70 [background-size:72px_72px]" />
          <svg
            className="pointer-events-none absolute inset-0"
            width={canvasWidth}
            height={canvasHeight}
          >
            <defs>
              <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(129, 140, 248, 0.6)" />
                <stop offset="100%" stopColor="rgba(236, 72, 153, 0.8)" />
              </linearGradient>
            </defs>
            {edges.map(edge => {
              const source = nodeMap.get(edge.from);
              const target = nodeMap.get(edge.to);
              if (!source || !target) {
                return null;
              }

              const start = {
                x:
                  target.x >= source.x
                    ? source.x + source.width
                    : target.x <= source.x
                    ? source.x
                    : source.x + source.width / 2,
                y:
                  target.y >= source.y
                    ? source.y + source.height / 2
                    : target.y <= source.y
                    ? source.y + source.height / 2
                    : source.y + source.height
              };

              const end = {
                x:
                  target.x >= source.x
                    ? target.x
                    : target.x <= source.x
                    ? target.x + target.width
                    : target.x + target.width / 2,
                y: target.y + target.height / 2
              };

              const controlOffset = Math.max(Math.abs(end.x - start.x) * 0.4, 80);

              const path = `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;

              const isHighlighted =
                (focusNode && (focusNode.id === edge.from || focusNode.id === edge.to)) || false;

              return (
                <path
                  key={edge.id}
                  d={path}
                  fill="none"
                  stroke="url(#edge-gradient)"
                  strokeWidth={isHighlighted ? 3.4 : 2.2}
                  strokeOpacity={isHighlighted ? 0.9 : 0.55}
                />
              );
            })}
          </svg>

          {nodes.map(node => {
            const isFocused =
              (focusProjectId && node.projectId === focusProjectId && node.type === "project") ||
              (focusChallengeId && node.challengeId === focusChallengeId && node.type === "challenge") ||
              (focusAskId && node.askId === focusAskId && node.type === "ask");

            const statusColor =
              node.type === "ask"
                ? node.status === "active"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : node.status === "closed"
                  ? "bg-rose-500/20 text-rose-200"
                  : "bg-indigo-500/20 text-indigo-100"
                : node.type === "challenge"
                ? node.status === "active" || node.status === "in_progress"
                  ? "bg-sky-500/20 text-sky-100"
                  : node.status === "closed"
                  ? "bg-amber-500/20 text-amber-100"
                  : "bg-slate-500/20 text-slate-200"
                : "bg-white/15 text-white";

            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                onClick={() => handleNodeClick(node)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleNodeClick(node);
                  }
                }}
                className={cn(
                  "absolute cursor-pointer rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-lg transition-all", 
                  "backdrop-blur",
                  node.type === "project" && "hover:border-indigo-400/80",
                  node.type === "challenge" && "hover:border-fuchsia-400/80",
                  node.type === "ask" && "hover:border-emerald-400/80",
                  isFocused ? "ring-2 ring-offset-2 ring-offset-slate-950" : "ring-0",
                  isFocused &&
                    (node.type === "project"
                      ? "ring-indigo-400"
                      : node.type === "challenge"
                      ? "ring-fuchsia-400"
                      : "ring-emerald-400"),
                  node.type === "project" ? "w-[260px]" : node.type === "challenge" ? "w-[240px]" : "w-[220px]"
                )}
                style={{ left: node.x, top: node.y }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{node.label}</p>
                    {node.subtitle && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-300">{node.subtitle}</p>
                    )}
                  </div>
                  {node.status && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide", statusColor)}>
                      {node.status}
                    </span>
                  )}
                </div>
                {node.meta && (
                  <p className="mt-3 text-[11px] uppercase tracking-wide text-slate-400">{node.meta}</p>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/90 via-slate-950/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

      <div className="pointer-events-none absolute left-6 top-6 text-xs font-medium uppercase tracking-wide text-slate-300">
        Déplacez-vous librement • Scroll pour zoomer
      </div>

      <div className="pointer-events-auto absolute right-6 top-6 flex items-center gap-2">
        <button
          type="button"
          onClick={handleResetView}
          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow hover:bg-white/20"
        >
          Réinitialiser la vue
        </button>
        {hasInteracted && (
          <span className="hidden rounded-full border border-white/5 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-wide text-slate-300 md:inline">
            Zoom {Math.round(viewport.scale * 100)}%
          </span>
        )}
      </div>

      {minimap && layoutBounds && (
        <div
          className="pointer-events-auto absolute bottom-6 right-6 rounded-2xl border border-white/15 bg-slate-900/80 p-3 shadow-lg"
          onPointerDown={handleMiniMapPointerDown}
        >
          <div
            className="relative h-[200px] w-[200px] overflow-hidden rounded-xl border border-white/5 bg-slate-950/80"
            style={{ cursor: "pointer" }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at center, rgba(148, 163, 184, 0.12) 1px, transparent 0)",
                backgroundSize: `${Math.max(12, 72 * minimap.scale)}px ${Math.max(12, 72 * minimap.scale)}px`
              }}
            />
            {nodes.map(node => (
              <div
                key={`mini-${node.id}`}
                className={cn(
                  "absolute rounded-lg",
                  node.type === "project"
                    ? "bg-indigo-400/50"
                    : node.type === "challenge"
                    ? "bg-fuchsia-400/60"
                    : "bg-emerald-400/60"
                )}
                style={{
                  left: (node.x - minimap.offsetX) * minimap.scale,
                  top: (node.y - minimap.offsetY) * minimap.scale,
                  width: node.width * minimap.scale,
                  height: node.height * minimap.scale
                }}
              />
            ))}
            <div
              className="absolute border border-white/70"
              style={{
                left: minimap.viewRect.x,
                top: minimap.viewRect.y,
                width: minimap.viewRect.width,
                height: minimap.viewRect.height,
                boxShadow: "0 0 0 1px rgba(255,255,255,0.6)"
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

