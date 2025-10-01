"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Filter, Link2, MessageSquareQuote } from "lucide-react";
import { InsightPanelProps, Insight } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeDate, getInsightTypeLabel } from "@/lib/utils";

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
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      className="neumorphic-shadow rounded-lg border border-border/60 bg-white/70 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-primary/50 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {getInsightTypeLabel(insight.type)}
            </span>
            {insight.category && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-900">
                {insight.category}
              </span>
            )}
            {insight.status !== "new" && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-900">
                {insight.status}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">
            {insight.summary || insight.content}
          </p>
          {insight.kpis?.length ? (
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="mb-1 text-xs font-semibold text-slate-600">KPIs associés</p>
              <ul className="space-y-1">
                {insight.kpis.map((kpi) => (
                  <li key={kpi.id} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-700">{kpi.label}</span>
                    {kpi.description && <span className="text-slate-500"> — {kpi.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {insight.authorName && <span>Partagé par {insight.authorName}</span>}
            <span>{formatRelativeDate(insight.createdAt)}</span>
            {insight.relatedChallengeIds?.length ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Lightbulb className="h-3 w-3" />
                {insight.relatedChallengeIds.length} challenge(s)
              </span>
            ) : null}
          </div>
        </div>
        {onLink && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onLink(insight.id)}
            title="Associer à un challenge"
          >
            <Link2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export function InsightPanel({ insights, askKey, onRequestChallengeLink }: InsightPanelProps) {
  const [activeFilter, setActiveFilter] = useState<InsightGroup["value"]>("all");

  const filteredInsights = useMemo(() => {
    if (activeFilter === "all") {
      return insights;
    }
    return insights.filter((insight) => insight.type === activeFilter);
  }, [activeFilter, insights]);

  return (
    <Card className="h-full glass-card overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquareQuote className="h-5 w-5 text-primary" />
            Insights collectés
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {filteredInsights.length} insight(s) pour la session {askKey}
          </p>
        </div>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filtrer
        </Button>
      </CardHeader>
      <CardContent className="flex h-full flex-col">
        <div className="mb-4 flex flex-wrap gap-2">
          {INSIGHT_GROUPS.map((group) => (
            <button
              key={group.value}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
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

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <AnimatePresence initial={false}>
            {filteredInsights.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted/80 bg-white/60 py-10 text-center"
              >
                <Lightbulb className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Aucun insight à afficher pour ce filtre.</p>
              </motion.div>
            ) : (
              filteredInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} onLink={onRequestChallengeLink} />
              ))
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
