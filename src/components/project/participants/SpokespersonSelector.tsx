"use client";

import { Label } from "@/components/ui/label";

export interface SpokespersonSelectorProps {
  /** Label text for the selector */
  label: string;
  /** Available participants to select from */
  participants: Array<{ id: string; name: string }>;
  /** Currently selected spokesperson ID */
  selectedId: string;
  /** Callback when selection changes */
  onSelect: (id: string) => void;
  /** Disable the selector */
  disabled?: boolean;
  /** Unique ID for accessibility */
  id?: string;
}

/**
 * Dropdown selector for choosing a spokesperson/facilitator
 * Used in group_reporter and consultant conversation modes
 */
export function SpokespersonSelector({
  label,
  participants,
  selectedId,
  onSelect,
  disabled = false,
  id = "spokesperson-selector",
}: SpokespersonSelectorProps) {
  if (participants.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm text-indigo-200">
        {label}
      </Label>
      <select
        id={id}
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
        className="h-10 rounded-md border border-white/10 bg-slate-900/70 px-3 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-400/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">No spokesperson</option>
        {participants.map((participant) => (
          <option key={participant.id} value={participant.id}>
            {participant.name}
          </option>
        ))}
      </select>
    </div>
  );
}
