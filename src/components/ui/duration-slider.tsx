"use client";

import { getDurationLabel, getDurationAlert, PACING_THRESHOLDS } from "@/lib/pacing";
import { cn } from "@/lib/utils";

interface DurationSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  showAlert?: boolean;
}

export function DurationSlider({
  value,
  onChange,
  disabled = false,
  min = 1,
  max = 30,
  showAlert = true,
}: DurationSliderProps) {
  const alert = getDurationAlert(value);
  const label = getDurationLabel(value);

  // Calculate percentage for gradient coloring
  const warningPercent = ((PACING_THRESHOLDS.WARNING - min) / (max - min)) * 100;
  const criticalPercent = ((PACING_THRESHOLDS.CRITICAL - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-xs text-muted-foreground">
          {value} min
        </span>
      </div>

      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className={cn(
            "w-full h-2 rounded-lg appearance-none cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          style={{
            background: `linear-gradient(to right,
              #22c55e 0%,
              #22c55e ${warningPercent}%,
              #f97316 ${warningPercent}%,
              #f97316 ${criticalPercent}%,
              #ef4444 ${criticalPercent}%,
              #ef4444 100%
            )`,
          }}
        />

        {/* Threshold markers */}
        <div className="absolute top-3 left-0 right-0 flex justify-between text-[10px] text-muted-foreground pointer-events-none">
          <span>{min}</span>
          <span
            className="absolute text-orange-500"
            style={{ left: `${warningPercent}%`, transform: 'translateX(-50%)' }}
          >
            {PACING_THRESHOLDS.WARNING}
          </span>
          <span
            className="absolute text-red-500"
            style={{ left: `${criticalPercent}%`, transform: 'translateX(-50%)' }}
          >
            {PACING_THRESHOLDS.CRITICAL}
          </span>
          <span>{max}</span>
        </div>
      </div>

      {/* Alert message */}
      {showAlert && alert.level !== 'none' && (
        <div
          className={cn(
            "flex items-start gap-2 p-2 rounded-md border text-xs",
            alert.bgColor,
            alert.borderColor,
            alert.color
          )}
        >
          {alert.level === 'warning' && (
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          {alert.level === 'critical' && (
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{alert.message}</span>
        </div>
      )}

      {/* Pacing level indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Rythme:</span>
        {value <= 7 && (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
            Intensif
          </span>
        )}
        {value > 7 && value <= 15 && (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
            Standard
          </span>
        )}
        {value > 15 && (
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
            Approfondi
          </span>
        )}
      </div>
    </div>
  );
}
