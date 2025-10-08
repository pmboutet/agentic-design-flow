"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

type DiffSegmentType = "added" | "removed" | "unchanged";

interface DiffSegment {
  type: DiffSegmentType;
  value: string;
}

function computeLineDiff(previous: string, next: string): DiffSegment[] {
  const oldLines = previous.split(/\r?\n/);
  const newLines = next.split(/\r?\n/);
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      segments.push({ type: "unchanged", value: oldLines[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      segments.push({ type: "removed", value: oldLines[i] });
      i += 1;
    } else {
      segments.push({ type: "added", value: newLines[j] });
      j += 1;
    }
  }

  while (i < m) {
    segments.push({ type: "removed", value: oldLines[i] });
    i += 1;
  }

  while (j < n) {
    segments.push({ type: "added", value: newLines[j] });
    j += 1;
  }

  const merged: DiffSegment[] = [];
  segments.forEach(segment => {
    const last = merged[merged.length - 1];
    if (last && last.type === segment.type) {
      last.value = `${last.value}\n${segment.value}`;
    } else {
      merged.push({ ...segment });
    }
  });

  return merged;
}

interface AiDiffViewProps {
  previous: string;
  next: string;
  className?: string;
}

export function AiDiffView({ previous, next, className }: AiDiffViewProps) {
  const segments = useMemo(() => computeLineDiff(previous ?? "", next ?? ""), [previous, next]);

  if (segments.length === 0) {
    return (
      <div className={cn("rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300", className)}>
        No changes proposed.
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-md border border-slate-700 bg-slate-900/60 text-sm font-mono", className)}>
      {segments.map((segment, index) => {
        const prefix = segment.type === "added" ? "+" : segment.type === "removed" ? "-" : " ";
        const rowClass =
          segment.type === "added"
            ? "bg-emerald-500/10 text-emerald-100"
            : segment.type === "removed"
              ? "bg-rose-500/10 text-rose-100"
              : "text-slate-200";

        return segment.value.split(/\r?\n/).map((line, lineIndex) => (
          <div
            key={`${index}-${lineIndex}`}
            className={cn("flex gap-3 whitespace-pre-wrap border-b border-slate-800 px-3 py-1.5 last:border-b-0", rowClass)}
          >
            <span className="w-4 text-center">{prefix}</span>
            <span className="flex-1">{line.length ? line : " "}</span>
          </div>
        ));
      })}
    </div>
  );
}
