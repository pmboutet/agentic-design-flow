"use client";

import { cn } from "@/lib/utils";
import { Check, Circle } from "lucide-react";

export interface ParticipantProgressBadgeProps {
  completedSteps: number;
  totalSteps: number;
  isCompleted: boolean;
  isActive: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Compact progress badge showing step progress
 * - Not started: Gray "--"
 * - Active: Amber "X/N" with dot
 * - Completed: Emerald "N/N" with checkmark
 */
export function ParticipantProgressBadge({
  completedSteps,
  totalSteps,
  isCompleted,
  isActive,
  size = "sm",
  className,
}: ParticipantProgressBadgeProps) {
  const notStarted = completedSteps === 0 && !isActive;

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5 gap-1",
    md: "text-sm px-2 py-1 gap-1.5",
  };

  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  if (notStarted) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded font-medium",
          "text-slate-500",
          sizeClasses[size],
          className
        )}
      >
        --
      </span>
    );
  }

  if (isCompleted) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded font-medium",
          "text-emerald-400",
          sizeClasses[size],
          className
        )}
      >
        {completedSteps}/{totalSteps}
        <Check className={iconSize} />
      </span>
    );
  }

  // Active / In progress
  return (
    <span
      className={cn(
        "inline-flex items-center rounded font-medium",
        "text-amber-400",
        sizeClasses[size],
        className
      )}
    >
      {completedSteps}/{totalSteps}
      <Circle className={cn(iconSize, "fill-current")} />
    </span>
  );
}
