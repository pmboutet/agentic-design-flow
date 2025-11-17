"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Filter, Link2, MessageSquareQuote } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { InsightPanelProps, Insight } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeDate, getInsightTypeLabel } from "@/lib/utils";

const insightMarkdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-1 last:mb-0 text-xs text-slate-800 leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-1 list-disc space-y-0.5 pl-4 text-xs text-slate-800 leading-relaxed">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-800 leading-relaxed">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-xs text-slate-800 leading-relaxed marker:text-primary">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-1 border-l-2 border-primary/40 bg-primary/5 px-2 py-1 text-xs italic text-slate-700">
      {children}
    </blockquote>
  ),
  a: ({ children, ...props }) => (
    <a
      {...props}
      className="text-xs text-primary underline decoration-primary/60 underline-offset-2 hover:text-primary/80"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-slate-700">{children}</em>,
};

interface InsightGroup {
  label: string;
  value: Insight["type"] | "all";
}

const INSIGHT_GROUPS: InsightGroup[] = [
  { label: "Tous", value: "all" },
  { label: "Pains", value: "pain" },
  { label: "Gains", value: "gain" },
  { label: "Opportunités", value: "opportunity" },
  { label: "Risques", value: "risk" },
  { label: "Signaux", value: "signal" },
  { label: "Idées", value: "idea" }
];

function InsightCard({ insight, onLink }: { insight: Insight; onLink?: (insightId: string) => void }) {
  const authorNames = (insight.authors ?? [])
    .map((author) => (author?.name ?? '').trim())
    .filter((name): name is string => name.length > 0);
  const authorLabel = authorNames.length > 0 ? authorNames.join(', ') : (insight.authorName ?? undefined);
  const categoryLabel = (() => {
    const raw = (insight.category ?? '').trim();
    return raw.length > 0 ? raw : "Analyse IA";
  })();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      className="neumorphic-shadow rounded-lg border border-border/60 bg-white/70 px-3 py-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-primary/50 bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {getInsightTypeLabel(insight.type)}
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
              {categoryLabel}
            </span>
            {insight.status !== "new" && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-900">
                {insight.status}
              </span>
            )}
          </div>
          {(() => {
            const insightContent = (insight.summary || insight.content || "").trim();
            if (!insightContent) {
              return null;
            }
            return (
              <ReactMarkdown
                className="space-y-2"
                components={insightMarkdownComponents}
              >
                {insightContent}
              </ReactMarkdown>
            );
          })()}
          {insight.kpis?.length ? (
            <div className="rounded-md bg-slate-50 px-2 py-1.5">
              <p className="mb-0.5 text-[10px] font-semibold text-slate-600">KPIs associés</p>
              <ul className="space-y-0.5">
                {insight.kpis.map((kpi) => (
                  <li key={kpi.id} className="text-[10px] text-slate-600">
                    <span className="font-medium text-slate-700">{kpi.label}</span>
                    {kpi.description && <span className="text-slate-500"> — {kpi.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
            {authorLabel && <span>Partagé par {authorLabel}</span>}
            <span>{formatRelativeDate(insight.createdAt)}</span>
            {insight.relatedChallengeIds?.length ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-600">
                <Lightbulb className="h-2.5 w-2.5" />
                {insight.relatedChallengeIds.length} challenge(s)
              </span>
            ) : null}
          </div>
        </div>
        {onLink && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onLink(insight.id)}
            title="Associer à un challenge"
          >
            <Link2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export function InsightPanel({ insights, askKey, onRequestChallengeLink, isDetectingInsights = false }: InsightPanelProps) {
  const [activeFilter, setActiveFilter] = useState<InsightGroup["value"]>("all");

  const filteredInsights = useMemo(() => {
    if (activeFilter === "all") {
      return insights;
    }
    return insights.filter((insight) => insight.type === activeFilter);
  }, [activeFilter, insights]);

  return (
    <Card className="h-full glass-card flex flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 pt-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareQuote className="h-4 w-4 text-primary" />
            Insights collectés
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {filteredInsights.length} insight(s) pour la session {askKey}
          </p>
        </div>
        <Button variant="outline" size="sm" className="flex items-center gap-2 h-7 text-xs px-2">
          <Filter className="h-3 w-3" />
          Filtrer
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden pt-2">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {INSIGHT_GROUPS.map((group) => (
            <button
              key={group.value}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                activeFilter === group.value
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white/70 text-slate-600 hover:border-primary/60"
              )}
              onClick={() => setActiveFilter(group.value)}
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <AnimatePresence initial={false}>
            {filteredInsights.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex h-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted/80 bg-white/60 py-6 text-center"
              >
                <Lightbulb className="h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Aucun insight à afficher pour ce filtre.</p>
              </motion.div>
            ) : (
              filteredInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} onLink={onRequestChallengeLink} />
              ))
            )}
          </AnimatePresence>
          
          {/* Indicateur de collecte d'insights en cours */}
          <AnimatePresence>
            {isDetectingInsights && (
              <motion.div
                key="insight-detection-indicator"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground bg-primary/5 rounded-lg border border-primary/20"
                aria-live="polite"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="flex h-2.5 w-2.5 items-center justify-center"
                >
                  <Lightbulb className="h-2.5 w-2.5 text-primary" />
                </motion.div>
                <span className="italic">Collecte d'insights en cours...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
