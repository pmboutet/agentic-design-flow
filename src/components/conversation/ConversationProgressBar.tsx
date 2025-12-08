"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getPacingLevel, getDurationAlert } from "@/lib/pacing";

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
}

export function ConversationProgressBar({ steps, currentStepId, expectedDurationMinutes }: ConversationProgressBarProps) {
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);

  if (!steps || steps.length === 0) {
    return null;
  }

  // Calculate pacing info
  const duration = expectedDurationMinutes ?? 8;
  const durationPerStep = steps.length > 0 ? Math.round((duration / steps.length) * 10) / 10 : duration;
  const pacingLevel = getPacingLevel(duration);
  const alert = getDurationAlert(duration);

  const pacingLevelLabels = {
    intensive: { label: 'Intensif', color: 'bg-green-100 text-green-700' },
    standard: { label: 'Standard', color: 'bg-blue-100 text-blue-700' },
    deep: { label: 'Approfondi', color: 'bg-purple-100 text-purple-700' },
  };

  const getStepColor = (step: ConversationStep) => {
    if (step.status === 'completed') {
      return 'bg-emerald-500';
    }
    if (step.status === 'active' || step.id === currentStepId) {
      return 'bg-blue-500';
    }
    if (step.status === 'skipped') {
      return 'bg-gray-400';
    }
    return 'bg-gray-300';
  };

  const getStepOpacity = (step: ConversationStep) => {
    if (step.status === 'completed') {
      return 'opacity-90';
    }
    if (step.status === 'active' || step.id === currentStepId) {
      return 'opacity-100';
    }
    return 'opacity-40';
  };

  return (
    <div className="w-full px-4 py-2 bg-white/50 backdrop-blur-sm border-b border-gray-200/50">
      <div className="max-w-4xl mx-auto">
        {/* Pacing indicator bar */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pacingLevelLabels[pacingLevel].color}`}>
              {pacingLevelLabels[pacingLevel].label}
            </span>
            <span className="text-[10px] text-gray-500">
              ~{duration} min total ({durationPerStep} min/étape)
            </span>
          </div>
          {alert.level !== 'none' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${alert.bgColor} ${alert.color}`}>
              {alert.level === 'warning' ? 'Attention' : 'Long'}
            </span>
          )}
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
                      className={`flex-1 h-1.5 rounded-full cursor-pointer transition-all duration-300 ${getStepColor(step)} ${getStepOpacity(step)}`}
                      whileHover={{ scale: 1.05, height: '8px' }}
                      onHoverStart={() => setHoveredStep(step.id)}
                      onHoverEnd={() => setHoveredStep(null)}
                      animate={{
                        height: hoveredStep === step.id ? '8px' : '6px',
                      }}
                    />
                  </PopoverTrigger>
                  <PopoverContent 
                    side="bottom" 
                    className="w-80 p-3 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-lg"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${getStepColor(step)}`}
                        />
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Étape {index + 1}/{steps.length}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          ~{durationPerStep} min
                        </span>
                        {isActive && (
                          <span className="ml-auto text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                            En cours
                          </span>
                        )}
                        {isCompleted && (
                          <span className="ml-auto text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                            Terminée
                          </span>
                        )}
                        {isPending && (
                          <span className="ml-auto text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                            À venir
                          </span>
                        )}
                      </div>
                      <h4 className="font-semibold text-gray-900 text-sm">
                        {step.title}
                      </h4>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {step.objective}
                      </p>
                      {isCompleted && step.summary && (
                        <div className="mt-3 pt-3 border-t border-emerald-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <svg
                              className="w-3.5 h-3.5 text-emerald-600"
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
                            <span className="text-xs font-semibold text-emerald-700">
                              Résumé de l'étape
                            </span>
                          </div>
                          <div className="bg-emerald-50/80 rounded-lg p-2.5 border border-emerald-100">
                            <p className="text-xs text-emerald-800 leading-relaxed">
                              {step.summary}
                            </p>
                          </div>
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

