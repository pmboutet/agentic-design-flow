"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

type DiffTokenType = "added" | "removed" | "unchanged";

interface DiffToken {
  type: DiffTokenType;
  value: string;
}

/**
 * Tokenize text into words and whitespace/punctuation, preserving all characters
 */
function tokenize(text: string): string[] {
  // Split by word boundaries, keeping separators
  return text.split(/(\s+|[.,;:!?()[\]{}'"«»—–-])/g).filter(t => t.length > 0);
}

/**
 * Compute word-level diff using LCS algorithm
 */
function computeWordDiff(previous: string, next: string): DiffToken[] {
  const oldTokens = tokenize(previous);
  const newTokens = tokenize(next);
  const m = oldTokens.length;
  const n = newTokens.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (oldTokens[i] === newTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff
  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (oldTokens[i] === newTokens[j]) {
      tokens.push({ type: "unchanged", value: oldTokens[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ type: "removed", value: oldTokens[i] });
      i += 1;
    } else {
      tokens.push({ type: "added", value: newTokens[j] });
      j += 1;
    }
  }

  while (i < m) {
    tokens.push({ type: "removed", value: oldTokens[i] });
    i += 1;
  }

  while (j < n) {
    tokens.push({ type: "added", value: newTokens[j] });
    j += 1;
  }

  // Merge consecutive tokens of same type
  const merged: DiffToken[] = [];
  tokens.forEach(token => {
    const last = merged[merged.length - 1];
    if (last && last.type === token.type) {
      last.value = `${last.value}${token.value}`;
    } else {
      merged.push({ ...token });
    }
  });

  return merged;
}

interface AiDiffViewProps {
  previous: string;
  next: string;
  className?: string;
  /** Callback when user wants to edit - if provided, shows edit button */
  onEdit?: () => void;
  /** Label for the edit button */
  editLabel?: string;
}

export function AiDiffView({ previous, next, className, onEdit, editLabel = "Modifier" }: AiDiffViewProps) {
  const tokens = useMemo(() => computeWordDiff(previous ?? "", next ?? ""), [previous, next]);

  // Check if there are any actual changes
  const hasChanges = tokens.some(t => t.type !== "unchanged");

  if (!hasChanges) {
    return (
      <div className={cn("rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300", className)}>
        Aucune modification.
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border border-slate-700 bg-slate-900/60 text-sm", className)}>
      <div className="p-3 whitespace-pre-wrap leading-relaxed">
        {tokens.map((token, index) => {
          if (token.type === "unchanged") {
            return (
              <span key={index} className="text-slate-200">
                {token.value}
              </span>
            );
          }

          if (token.type === "removed") {
            return (
              <span
                key={index}
                className="bg-rose-500/20 text-rose-300 line-through decoration-rose-400/60"
              >
                {token.value}
              </span>
            );
          }

          // added
          return (
            <span
              key={index}
              className="bg-emerald-500/20 text-emerald-300"
            >
              {token.value}
            </span>
          );
        })}
      </div>

      {onEdit && (
        <div className="border-t border-slate-700 px-3 py-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="text-slate-400 hover:text-slate-200 gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            {editLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
