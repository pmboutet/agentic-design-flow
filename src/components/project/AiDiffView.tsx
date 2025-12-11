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
 * Tokenize text into words, preserving whitespace
 */
function tokenizeWords(text: string): string[] {
  // Split keeping whitespace and punctuation as separate tokens
  return text.split(/(\s+)/g).filter(t => t.length > 0);
}

/**
 * Compute LCS-based diff on an array of strings
 */
function lcsArrayDiff<T>(oldArr: T[], newArr: T[]): Array<{ type: DiffTokenType; value: T }> {
  const m = oldArr.length;
  const n = newArr.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (oldArr[i] === newArr[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: Array<{ type: DiffTokenType; value: T }> = [];
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (oldArr[i] === newArr[j]) {
      result.push({ type: "unchanged", value: oldArr[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", value: oldArr[i] });
      i += 1;
    } else {
      result.push({ type: "added", value: newArr[j] });
      j += 1;
    }
  }

  while (i < m) {
    result.push({ type: "removed", value: oldArr[i] });
    i += 1;
  }

  while (j < n) {
    result.push({ type: "added", value: newArr[j] });
    j += 1;
  }

  return result;
}

/**
 * Compute word-level diff for a pair of modified lines
 */
function diffWords(oldText: string, newText: string): DiffToken[] {
  const oldWords = tokenizeWords(oldText);
  const newWords = tokenizeWords(newText);

  const diff = lcsArrayDiff(oldWords, newWords);

  // Merge consecutive tokens of same type
  const merged: DiffToken[] = [];
  diff.forEach(item => {
    const last = merged[merged.length - 1];
    if (last && last.type === item.type) {
      last.value += item.value;
    } else {
      merged.push({ type: item.type, value: item.value });
    }
  });

  return merged;
}

/**
 * Compute diff using line-then-word approach for better accuracy
 * First diff by lines, then for changed lines, diff by words
 */
function computeLineThenWordDiff(previous: string, next: string): DiffToken[] {
  const oldLines = previous.split(/\n/);
  const newLines = next.split(/\n/);

  // First pass: diff by lines
  const lineDiff = lcsArrayDiff(oldLines, newLines);

  // Process line diff and apply word-level diff for changes
  const result: DiffToken[] = [];
  let i = 0;

  while (i < lineDiff.length) {
    const item = lineDiff[i];

    if (item.type === "unchanged") {
      // Unchanged line - add as is
      if (result.length > 0 && !result[result.length - 1].value.endsWith("\n")) {
        result.push({ type: "unchanged", value: "\n" });
      }
      result.push({ type: "unchanged", value: item.value });
      i += 1;
      continue;
    }

    // Collect consecutive removed and added lines
    const removedLines: string[] = [];
    const addedLines: string[] = [];

    while (i < lineDiff.length && lineDiff[i].type !== "unchanged") {
      if (lineDiff[i].type === "removed") {
        removedLines.push(lineDiff[i].value);
      } else {
        addedLines.push(lineDiff[i].value);
      }
      i += 1;
    }

    // If we have both removed and added, do word-level diff
    if (removedLines.length > 0 && addedLines.length > 0) {
      const oldText = removedLines.join("\n");
      const newText = addedLines.join("\n");
      const wordDiff = diffWords(oldText, newText);

      if (result.length > 0 && !result[result.length - 1].value.endsWith("\n")) {
        result.push({ type: "unchanged", value: "\n" });
      }
      result.push(...wordDiff);
    } else {
      // Only removals or only additions
      if (removedLines.length > 0) {
        if (result.length > 0 && !result[result.length - 1].value.endsWith("\n")) {
          result.push({ type: "unchanged", value: "\n" });
        }
        result.push({ type: "removed", value: removedLines.join("\n") });
      }
      if (addedLines.length > 0) {
        if (result.length > 0 && !result[result.length - 1].value.endsWith("\n")) {
          result.push({ type: "unchanged", value: "\n" });
        }
        result.push({ type: "added", value: addedLines.join("\n") });
      }
    }
  }

  // Final merge of consecutive same-type tokens
  const merged: DiffToken[] = [];
  result.forEach(token => {
    const last = merged[merged.length - 1];
    if (last && last.type === token.type) {
      last.value += token.value;
    } else if (token.value.length > 0) {
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
}

export function AiDiffView({ previous, next, className, onEdit }: AiDiffViewProps) {
  const tokens = useMemo(() => computeLineThenWordDiff(previous ?? "", next ?? ""), [previous, next]);

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
    <div className={cn("group relative rounded-md border border-slate-700 bg-slate-900/60 text-sm", className)}>
      {/* Edit button - top right, visible on hover */}
      {onEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="absolute right-2 top-2 h-6 px-2 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-slate-200 z-10"
          title="Modifier"
        >
          <Pencil className="h-3.5 w-3.5 mr-1" />
          <span className="text-xs">Modifier</span>
        </Button>
      )}

      {/* Diff with colored changes */}
      <div className="p-3 pr-10 whitespace-pre-wrap leading-relaxed">
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
    </div>
  );
}
