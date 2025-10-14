"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type NodePoint = { x: number; y: number };
type Props = { progress?: number; className?: string; compact?: boolean; snippets?: string[]; intervalMs?: number };

function seededRandom(seed: number) {
  // Linear congruential generator for deterministic node positions
  let s = seed % 2147483647;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

function createNodes(count: number, width: number, height: number, seed = 42): NodePoint[] {
  const rnd = seededRandom(seed);
  const margin = 24;
  const nodes: NodePoint[] = [];
  for (let i = 0; i < count; i++) {
    const x = margin + rnd() * (width - margin * 2);
    const y = margin + rnd() * (height - margin * 2);
    nodes.push({ x: Math.round(x), y: Math.round(y) });
  }
  return nodes;
}

function createLinks(nodes: NodePoint[]) {
  const links: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  // Connect each node to its nearest 2 neighbors for a clean mesh
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const distances: Array<{ j: number; d: number }> = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      distances.push({ j, d: Math.hypot(dx, dy) });
    }
    distances.sort((u, v) => u.d - v.d);
    for (let k = 0; k < Math.min(2, distances.length); k++) {
      const b = nodes[distances[k].j];
      links.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return links;
}

export function LoaderInsightConstellation({ progress = 0, className, compact = false, snippets = [], intervalMs = 2600 }: Props) {
  const prefersReduced = useReducedMotion();
  const width = 800;
  const height = compact ? 160 : 260;
  const nodeCount = compact ? 10 : 14;

  const nodes = useMemo(() => createNodes(nodeCount, width, height, 137), [nodeCount, width, height]);
  const links = useMemo(() => createLinks(nodes), [nodes]);

  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!snippets.length) return;
    if (prefersReduced) return; // avoid motion changes
    const id = setInterval(() => setIndex(i => (i + 1) % snippets.length), intervalMs);
    return () => clearInterval(id);
  }, [snippets.length, intervalMs, prefersReduced]);

  if (prefersReduced) {
    // Reduced motion: minimal linear progress bar
    return (
      <div className={cn("relative w-full rounded-lg border border-slate-800 bg-slate-900/70 p-4", className)} role="status" aria-busy>
        <p className="mb-2 text-sm text-slate-300">Analyzing insights and challenges…</p>
        <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-indigo-400" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950",
        compact ? "p-3" : "p-4",
        className
      )}
      role="status"
      aria-busy
      aria-label="Analyzing insights and challenges"
    >
      <p className="pointer-events-none absolute left-4 top-3 z-10 text-sm text-slate-300">
        Analyzing insights and challenges…
      </p>
      <span className="pointer-events-none absolute right-4 top-3 z-10 text-xs text-slate-400">
        {Math.round(progress)}%
      </span>
      <svg className="block" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden>
        {links.map((l, i) => (
          <motion.line
            key={`l-${i}`}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="rgba(148,163,184,0.22)"
            strokeWidth={1}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: Math.min(1, Math.max(0, progress / 100)) }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        ))}
        {nodes.map((n, i) => (
          <motion.circle
            key={`n-${i}`}
            cx={n.x}
            cy={n.y}
            r={2.6}
            fill={i / nodes.length <= progress / 100 ? "#93c5fd" : "#64748b"}
            animate={{ r: [2.6, 3.6, 2.6] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.08 }}
          />
        ))}
      </svg>

      {snippets.length ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 select-none">
          <div className="relative px-4 pb-3">
            <div
              className="absolute inset-x-0 bottom-0 h-10"
              style={{
                background:
                  "linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.6) 50%, rgba(2,6,23,0.95) 100%)",
              }}
            />
            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`snippet-${index}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="line-clamp-1 text-sm text-slate-200/90"
                >
                  {snippets[index]}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LoaderInsightConstellation;


