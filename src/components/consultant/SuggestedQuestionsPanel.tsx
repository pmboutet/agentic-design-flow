"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquareText, Copy, Check, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SuggestedQuestion, SuggestedQuestionsPanelProps } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function QuestionCard({
  question,
  index,
  onCopy,
  isDismissed,
  onDismiss,
}: {
  question: SuggestedQuestion;
  index: number;
  onCopy?: (questionId: string) => void;
  isDismissed: boolean;
  onDismiss: (questionId: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(question.text);
      setCopied(true);
      onCopy?.(question.id);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy question:", err);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.4, 0, 0.2, 1]
      }}
    >
      <div className={cn(
        "rounded-xl border px-4 py-3 backdrop-blur-sm transition-all",
        isDismissed
          ? "border-slate-400/30 bg-slate-500/10 opacity-60"
          : "border-emerald-400/40 bg-emerald-500/10"
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className={cn("flex-1", isDismissed && "line-through decoration-slate-400")}>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn(
                "inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold",
                isDismissed ? "bg-slate-400" : "bg-emerald-500"
              )}>
                {index + 1}
              </span>
              <span className={cn(
                "text-[10px] font-medium uppercase tracking-wider",
                isDismissed ? "text-slate-400" : "text-emerald-600/80"
              )}>
                {isDismissed ? "Question posée" : "Question suggérée"}
              </span>
            </div>
            <div className={cn(
              "prose prose-sm prose-slate max-w-none text-base font-medium leading-relaxed prose-p:my-1 prose-strong:text-slate-900",
              isDismissed ? "text-slate-500" : "text-slate-800"
            )}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {question.text}
              </ReactMarkdown>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 shrink-0 transition-all",
                isDismissed
                  ? "bg-emerald-100 text-emerald-600"
                  : "hover:bg-emerald-100 text-slate-400 hover:text-emerald-600"
              )}
              onClick={() => onDismiss(question.id)}
              title={isDismissed ? "Marquer comme non posée" : "Marquer comme posée"}
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 shrink-0 transition-all",
                copied
                  ? "bg-emerald-100 text-emerald-600"
                  : "hover:bg-emerald-100 text-slate-400 hover:text-emerald-600"
              )}
              onClick={handleCopy}
              title={copied ? "Copié !" : "Copier la question"}
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function SuggestedQuestionsPanel({
  questions,
  isAnalyzing = false,
  onQuestionCopy,
}: SuggestedQuestionsPanelProps) {
  // Keep track of previous questions to detect new ones
  const prevQuestionsRef = useRef<Map<string, string>>(new Map()); // id -> text
  const [isNewQuestions, setIsNewQuestions] = useState(false);
  // Track dismissed questions by their id
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentMap = new Map(questions.map(q => [q.id, q.text]));
    const prevMap = prevQuestionsRef.current;

    // Check if we have new questions or modified questions
    let hasChanges = false;
    const newDismissedIds = new Set(dismissedIds);

    for (const [id, text] of currentMap) {
      const prevText = prevMap.get(id);
      if (prevText === undefined) {
        // New question
        hasChanges = true;
      } else if (prevText !== text) {
        // Question was modified - remove from dismissed
        newDismissedIds.delete(id);
        hasChanges = true;
      }
    }

    // Update dismissed state if any questions were un-dismissed due to modification
    if (newDismissedIds.size !== dismissedIds.size) {
      setDismissedIds(newDismissedIds);
    }

    if (hasChanges && questions.length > 0) {
      setIsNewQuestions(true);
      setTimeout(() => setIsNewQuestions(false), 2000);
    }

    prevQuestionsRef.current = currentMap;
  }, [questions, dismissedIds]);

  const handleDismiss = (questionId: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  return (
    <Card className={cn(
      "glass-card overflow-hidden transition-all duration-300",
      isNewQuestions && "ring-2 ring-primary/50 ring-offset-2"
    )}>
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <motion.div
            animate={isAnalyzing ? { rotate: 360 } : { rotate: 0 }}
            transition={{ duration: 2, repeat: isAnalyzing ? Infinity : 0, ease: "linear" }}
          >
            <Sparkles className={cn(
              "h-4 w-4",
              isAnalyzing ? "text-amber-500" : "text-primary"
            )} />
          </motion.div>
          <span>Questions suggérées</span>
          {isAnalyzing && (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyse en cours...
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Questions à poser pour guider la conversation
        </p>
      </CardHeader>
      <CardContent className="pt-2 pb-3">
        <AnimatePresence mode="popLayout">
          {questions.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted/80 bg-white/60 py-6 text-center"
            >
              <MessageSquareText className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {isAnalyzing
                  ? "Analyse de la conversation..."
                  : "En attente des premiers échanges"}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {questions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={index}
                  onCopy={onQuestionCopy}
                  isDismissed={dismissedIds.has(question.id)}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
