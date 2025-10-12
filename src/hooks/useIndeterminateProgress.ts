import { useEffect, useRef, useState } from "react";

/**
 * useIndeterminateProgress
 * Smoothly ramps progress from 0 to a ceiling (default ~90%) while a task is running.
 * When running stops, it completes to 100 and then freezes.
 */
export function useIndeterminateProgress(
  isRunning: boolean,
  stepMs: number = 80,
  ceilingPercent: number = 90
): number {
  const [progress, setProgress] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (!isRunning) {
      // Complete to 100 when run ends
      setProgress(prev => (prev < 100 ? 100 : prev));
      // Stop any pending animation frame
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    setProgress(prev => (prev === 100 ? 0 : prev));
    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - lastTickRef.current;
      if (elapsed >= stepMs) {
        lastTickRef.current = now;
        setProgress(prev => {
          if (!isRunning) return prev;
          if (prev >= ceilingPercent) return prev; // hold near-complete while running
          // Ease upward with diminishing increments
          const remaining = Math.max(0, ceilingPercent - prev);
          const step = Math.max(0.2, remaining * 0.06); // larger when far, smaller when close
          const next = Math.min(ceilingPercent, prev + step);
          return Number(next.toFixed(2));
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isRunning, stepMs, ceilingPercent]);

  return progress;
}

export default useIndeterminateProgress;


