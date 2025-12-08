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
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <span className="text-xs text-slate-400">
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
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400/50 focus:ring-offset-slate-900",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          style={{
            background: `linear-gradient(to right,
              rgba(34, 197, 94, 0.6) 0%,
              rgba(34, 197, 94, 0.6) ${warningPercent}%,
              rgba(249, 115, 22, 0.6) ${warningPercent}%,
              rgba(249, 115, 22, 0.6) ${criticalPercent}%,
              rgba(239, 68, 68, 0.6) ${criticalPercent}%,
              rgba(239, 68, 68, 0.6) 100%
            )`,
          }}
        />

        {/* Threshold markers */}
        <div className="absolute top-3 left-0 right-0 flex justify-between text-[10px] text-slate-500 pointer-events-none">
          <span>{min}</span>
          <span
            className="absolute text-orange-400/70"
            style={{ left: `${warningPercent}%`, transform: 'translateX(-50%)' }}
          >
            {PACING_THRESHOLDS.WARNING}
          </span>
          <span
            className="absolute text-red-400/70"
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
            alert.level === 'warning' && "border-orange-500/30 bg-orange-500/10 text-orange-300/80",
            alert.level === 'critical' && "border-red-500/30 bg-red-500/10 text-red-300/80"
          )}
        >
          {alert.level === 'warning' && (
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          {alert.level === 'critical' && (
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{alert.message}</span>
        </div>
      )}

      {/* Pacing level indicator */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>Rythme:</span>
        {value <= 7 && (
          <span className="px-2 py-0.5 bg-green-500/20 text-green-300/90 rounded-full font-medium border border-green-500/30">
            Intensif
          </span>
        )}
        {value > 7 && value <= 15 && (
          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300/90 rounded-full font-medium border border-blue-500/30">
            Standard
          </span>
        )}
        {value > 15 && (
          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300/90 rounded-full font-medium border border-purple-500/30">
            Approfondi
          </span>
        )}
      </div>
    </div>
  );
}
