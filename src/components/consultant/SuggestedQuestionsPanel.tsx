"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquareText, Copy, Check, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SuggestedQuestion, SuggestedQuestionsPanelProps } from "@/types";

function QuestionCard({
  question,
  index,
  onCopy,
}: {
  question: SuggestedQuestion;
  index: number;
  onCopy?: (questionId: string) => void;
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
      className="relative"
    >
      {/* Glow effect on new questions */}
      <motion.div
        className="absolute -inset-1 rounded-xl bg-gradient-to-r from-primary/30 via-primary/20 to-primary/30 opacity-0 blur-lg"
        initial={{ opacity: 0.8 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 2, delay: 0.5 }}
      />

      <div className="relative rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-white to-primary/10 px-4 py-3 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold">
                {index + 1}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-primary/70">
                Question suggérée
              </span>
            </div>
            <p className="text-base font-medium leading-relaxed text-slate-800">
              {question.text}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0 transition-all",
              copied
                ? "bg-emerald-100 text-emerald-600"
                : "hover:bg-primary/10 text-slate-500 hover:text-primary"
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
    </motion.div>
  );
}

export function SuggestedQuestionsPanel({
  questions,
  isAnalyzing = false,
  onQuestionCopy,
}: SuggestedQuestionsPanelProps) {
  // Keep track of previous questions to detect new ones
  const prevQuestionsRef = useRef<string[]>([]);
  const [isNewQuestions, setIsNewQuestions] = useState(false);

  useEffect(() => {
    const currentIds = questions.map(q => q.id);
    const prevIds = prevQuestionsRef.current;

    // Check if we have new questions
    const hasNewQuestions = currentIds.some(id => !prevIds.includes(id));

    if (hasNewQuestions && questions.length > 0) {
      setIsNewQuestions(true);
      // Reset the "new" state after animation
      setTimeout(() => setIsNewQuestions(false), 2000);
    }

    prevQuestionsRef.current = currentIds;
  }, [questions]);

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
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
