"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, CheckCircle2, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { getPacingLevel } from "@/lib/pacing";

export interface ConversationStep {
  id: string;
  title: string;
  objective: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  summary?: string | null;
}

export interface ConversationProgressBarProps {
  steps: ConversationStep[];
  currentStepId: string;
  expectedDurationMinutes?: number | null;
  elapsedMinutes?: number;
  /** Whether the timer is currently paused */
  isTimerPaused?: boolean;
  /** Callback to toggle pause/resume the timer */
  onTogglePause?: () => void;
  /** Consultant mode - shows manual step validation button */
  consultantMode?: boolean;
  /** Callback when consultant manually validates a step */
  onValidateStep?: (stepId: string) => Promise<void>;
  /** Whether a step validation is in progress */
  isValidatingStep?: boolean;
  /** Visual variant: light (default) for text mode, dark for voice mode */
  variant?: "light" | "dark";
}

export function ConversationProgressBar({
  steps,
  currentStepId,
  expectedDurationMinutes,
  elapsedMinutes = 0,
  isTimerPaused = false,
  onTogglePause,
  consultantMode = false,
  onValidateStep,
  isValidatingStep = false,
  variant = "light",
}: ConversationProgressBarProps) {
  const isDark = variant === "dark";
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);

  if (!steps || steps.length === 0) {
    return null;
  }

  // Calculate pacing info
  const duration = expectedDurationMinutes ?? 8;
  const durationPerStep = steps.length > 0 ? Math.round((duration / steps.length) * 10) / 10 : duration;
  const pacingLevel = getPacingLevel(duration);

  const pacingLevelLabels = isDark ? {
    intensive: { label: 'Intensif', color: 'bg-green-500/20 text-green-300' },
    standard: { label: 'Standard', color: 'bg-blue-500/20 text-blue-300' },
    deep: { label: 'Approfondi', color: 'bg-purple-500/20 text-purple-300' },
  } : {
    intensive: { label: 'Intensif', color: 'bg-green-100 text-green-700' },
    standard: { label: 'Standard', color: 'bg-blue-100 text-blue-700' },
    deep: { label: 'Approfondi', color: 'bg-purple-100 text-purple-700' },
  };

  const getStepClasses = (step: ConversationStep) => {
    if (isDark) {
      // Dark mode: glowing effects for voice interface
      if (step.status === 'completed') {
        return 'bg-emerald-400/80 border border-emerald-300/60 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
      }
      if (step.status === 'active' || step.id === currentStepId) {
        return 'bg-sky-400/90 border border-sky-300/60 shadow-[0_0_8px_rgba(14,165,233,0.4)]';
      }
      if (step.status === 'skipped') {
        return 'bg-white/5 border border-white/5 opacity-40';
      }
      return 'bg-white/15 border border-white/5 opacity-60';
    }
    // Light mode
    if (step.status === 'completed') {
      return 'bg-emerald-500 opacity-90';
    }
    if (step.status === 'active' || step.id === currentStepId) {
      return 'bg-blue-500 opacity-100';
    }
    if (step.status === 'skipped') {
      return 'bg-gray-400 opacity-40';
    }
    return 'bg-gray-300 opacity-40';
  };

  return (
    <div className={`w-full px-4 py-2 backdrop-blur-sm ${
      isDark
        ? 'bg-white/5 border border-white/10 rounded-xl'
        : 'bg-white/50 border-b border-gray-200/50'
    }`}>
      <div className="max-w-4xl mx-auto">
        {/* Pacing indicator bar */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pacingLevelLabels[pacingLevel].color}`}>
              {pacingLevelLabels[pacingLevel].label}
            </span>
            <span className={`text-[10px] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              ~{duration} min total ({durationPerStep} min/étape)
            </span>
          </div>
          <button
            onClick={onTogglePause}
            disabled={!onTogglePause}
            className={`text-[10px] flex items-center gap-1.5 transition-colors ${
              onTogglePause ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
            } ${isTimerPaused
              ? (isDark ? 'text-amber-400' : 'text-amber-600')
              : (isDark ? 'text-white/50' : 'text-gray-500')
            }`}
            title={isTimerPaused ? 'Reprendre le timer' : 'Mettre en pause le timer'}
          >
            {elapsedMinutes} min écoulées
            {onTogglePause && (
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors ${
                isTimerPaused
                  ? (isDark ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-amber-100 text-amber-700 hover:bg-amber-200')
                  : (isDark ? 'bg-white/10 text-white/60 hover:bg-white/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
              }`}>
                {isTimerPaused ? (
                  <>
                    <Play className="h-2.5 w-2.5" />
                    <span className="text-[9px] font-medium">reprendre</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-2.5 w-2.5" />
                    <span className="text-[9px] font-medium">pause</span>
                  </>
                )}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1">
          {steps.map((step, index) => {
            const isActive = step.id === currentStepId || step.status === 'active';
            const isCompleted = step.status === 'completed';
            const isPending = step.status === 'pending';

            return (
              <React.Fragment key={step.id}>
                <Popover>
                  <PopoverTrigger asChild>
                    <motion.div
                      className={`flex-1 h-1.5 rounded-full cursor-pointer transition-all duration-300 ${getStepClasses(step)}`}
                      whileHover={{ height: 8, opacity: 1 }}
                      onHoverStart={() => setHoveredStep(step.id)}
                      onHoverEnd={() => setHoveredStep(null)}
                      animate={{
                        height: hoveredStep === step.id ? 8 : 6,
                      }}
                    />
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="center"
                    sideOffset={10}
                    className={`w-80 p-3 backdrop-blur-sm shadow-lg ${
                      isDark
                        ? 'bg-[#080b18]/95 text-white border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.55)]'
                        : 'bg-white/95 border border-gray-200'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isCompleted ? 'bg-emerald-500' :
                            isActive ? (isDark ? 'bg-sky-400' : 'bg-blue-500') :
                            'bg-gray-400'
                          }`}
                        />
                        <span className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-white/70' : 'text-gray-500'}`}>
                          Étape {index + 1}/{steps.length}
                        </span>
                        <span className={`text-[10px] ${isDark ? 'text-white/50' : 'text-gray-400'}`}>
                          ~{durationPerStep} min
                        </span>
                        {isActive && (
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                            isDark ? 'bg-sky-500/20 text-sky-100' : 'bg-blue-100 text-blue-700'
                          }`}>
                            En cours
                          </span>
                        )}
                        {isCompleted && (
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                            isDark ? 'bg-emerald-500/20 text-emerald-100' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            Terminée
                          </span>
                        )}
                        {isPending && (
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                            isDark ? 'bg-white/10 text-white/70' : 'bg-gray-100 text-gray-600'
                          }`}>
                            À venir
                          </span>
                        )}
                        {step.status === 'skipped' && (
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                            isDark ? 'bg-white/5 text-white/60' : 'bg-gray-100 text-gray-500'
                          }`}>
                            Sautée
                          </span>
                        )}
                      </div>
                      <h4 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {step.title}
                      </h4>
                      <p className={`text-xs leading-relaxed ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                        {step.objective}
                      </p>
                      {isCompleted && step.summary && (
                        <div className={`mt-3 pt-3 border-t ${isDark ? 'border-emerald-500/20' : 'border-emerald-200'}`}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <svg
                              className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span className={`text-xs font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                              Résumé de l'étape
                            </span>
                          </div>
                          <div className={`rounded-lg p-2.5 border ${
                            isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50/80 border-emerald-100'
                          }`}>
                            <p className={`text-xs leading-relaxed ${isDark ? 'text-emerald-100' : 'text-emerald-800'}`}>
                              {step.summary}
                            </p>
                          </div>
                        </div>
                      )}
                      {/* Manual step validation button for consultant mode */}
                      {consultantMode && isActive && onValidateStep && (
                        <div className="mt-3 pt-3 border-t border-blue-200">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onValidateStep(step.id)}
                            disabled={isValidatingStep}
                            className="w-full bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                          >
                            {isValidatingStep ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                Validation...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                Valider cette étape
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {index < steps.length - 1 && (
                  <div className="w-1" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

