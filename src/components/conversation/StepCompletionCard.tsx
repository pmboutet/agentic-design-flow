"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StepCompletionCardProps {
  stepNumber: number;
  stepTitle: string;
  stepObjective: string;
  /** 'light' for text mode (emerald on white), 'dark' for voice mode (emerald on dark) */
  variant?: 'light' | 'dark';
  className?: string;
}

/**
 * StepCompletionCard - Shared component for displaying step completion celebration
 *
 * Used in both ChatComponent (text mode) and PremiumVoiceInterface (voice mode)
 * to show a celebration card when a conversation step is completed.
 */
export function StepCompletionCard({
  stepNumber,
  stepTitle,
  stepObjective,
  variant = 'light',
  className,
}: StepCompletionCardProps) {
  const isDark = variant === 'dark';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className={cn(
        "rounded-lg border px-4 py-3 shadow-sm",
        isDark
          ? "border-emerald-500/40 bg-emerald-900/30 backdrop-blur-sm"
          : "border-emerald-500/30 bg-gradient-to-r from-emerald-50/80 to-teal-50/80",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Animated checkmark icon */}
        <motion.div
          initial={{ rotate: 0, scale: 0 }}
          animate={{ rotate: 360, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className={cn(
            "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full mt-0.5",
            isDark ? "bg-emerald-500/30" : "bg-emerald-500/20"
          )}
        >
          <svg
            className={cn(
              "h-4 w-4",
              isDark ? "text-emerald-400" : "text-emerald-600"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </motion.div>

        {/* Step info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              "text-sm font-semibold",
              isDark ? "text-emerald-300" : "text-emerald-700"
            )}>
              Étape {stepNumber} complétée !
            </span>
          </div>
          <p className={cn(
            "text-sm font-medium mb-1",
            isDark ? "text-emerald-200" : "text-emerald-800"
          )}>
            {stepTitle}
          </p>
          <p className={cn(
            "text-xs leading-relaxed",
            isDark ? "text-emerald-300/80" : "text-emerald-700/80"
          )}>
            {stepObjective}
          </p>
        </div>

        {/* Animated pulsing dots */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="flex gap-0.5 flex-shrink-0 mt-1"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isDark ? "bg-emerald-400" : "bg-emerald-500"
              )}
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
