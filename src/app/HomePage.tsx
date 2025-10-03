"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Clock, MessageSquare, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { ChatComponent } from "@/components/chat/ChatComponent";
import { InsightPanel } from "@/components/insight/InsightPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionData, Ask, Message, Insight, ApiResponse } from "@/types";
import {
  validateAskKey,
  parseErrorMessage,
  formatTimeRemaining,
  getAudienceDescription,
  getDeliveryModeLabel,
} from "@/lib/utils";

/**
 * Main application page with beautiful glassmorphic design
 * Displays chat on 1/3 of screen and challenges on 2/3
 * All data comes from external backend via webhooks
 */
export default function HomePage() {
  const searchParams = useSearchParams();
  const [sessionData, setSessionData] = useState<SessionData>({
    askKey: '',
    ask: null,
    messages: [],
    insights: [],
    challenges: [],
    isLoading: false,
    error: null
  });
  const responseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [awaitingAiResponse, setAwaitingAiResponse] = useState(false);
  const participantFromUrl = searchParams.get('participant') || searchParams.get('participantName');
  const currentParticipantName = participantFromUrl?.trim() ? participantFromUrl.trim() : null;
  const isTestMode = searchParams.get('mode') === 'test';
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);
  const autoCollapseTriggeredRef = useRef(false);
  const previousMessageCountRef = useRef(0);
  const askDetails = sessionData.ask;
  const participants = askDetails?.participants ?? [];
  const statusLabel = askDetails?.status
    ? askDetails.status.charAt(0).toUpperCase() + askDetails.status.slice(1)
    : askDetails?.isActive
      ? 'Active'
      : 'Inactive';
  const startDate = askDetails?.startDate ? new Date(askDetails.startDate) : null;
  const endDate = askDetails?.endDate ? new Date(askDetails.endDate) : null;
  const now = new Date();
  let timelineLabel: string | null = null;

  if (startDate && now < startDate) {
    timelineLabel = `Commence le ${startDate.toLocaleString()}`;
  } else if (endDate && now > endDate) {
    timelineLabel = `Terminé le ${endDate.toLocaleString()}`;
  } else if (startDate && endDate) {
    timelineLabel = `En cours jusqu'au ${endDate.toLocaleString()}`;
  } else if (endDate) {
    timelineLabel = `Clôture le ${endDate.toLocaleString()}`;
  }

  const timeRemaining = askDetails?.endDate ? formatTimeRemaining(askDetails.endDate) : null;

  const cancelResponseTimer = useCallback(() => {
    if (responseTimerRef.current) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  }, []);

  const triggerAiResponse = useCallback(async () => {
    if (!sessionData.askKey) {
      return;
    }

    try {
      setSessionData(prev => ({
        ...prev,
        isLoading: true,
      }));

      if (isTestMode) {
        const simulatedAiMessage: Message = {
          id: `ai-${Date.now()}`,
          askKey: sessionData.askKey,
          askSessionId: sessionData.ask?.askSessionId,
          content: "Message de test : voici une réponse simulée de l'agent.",
          type: 'text',
          senderType: 'ai',
          senderId: null,
          senderName: 'Agent',
          timestamp: new Date().toISOString(),
          metadata: { senderName: 'Agent' },
        };

        setSessionData(prev => ({
          ...prev,
          messages: [...prev.messages, simulatedAiMessage],
          isLoading: false,
        }));
        return;
      }

      const response = await fetch(`/api/ask/${sessionData.askKey}/respond`, {
        method: 'POST',
      });

      const data: ApiResponse<{ message: Message; insights?: Insight[] }> = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unable to retrieve AI response');
      }

      if (data.data?.message) {
        setSessionData(prev => ({
          ...prev,
          messages: [...prev.messages, data.data!.message],
          insights: data.data?.insights ?? prev.insights,
          isLoading: false,
        }));
      } else if (data.data?.insights) {
        setSessionData(prev => ({
          ...prev,
          insights: data.data?.insights ?? prev.insights,
          isLoading: false,
        }));
      } else {
        setSessionData(prev => ({
          ...prev,
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error('Unable to trigger AI response webhook', error);
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        error: parseErrorMessage(error)
      }));
    } finally {
      setAwaitingAiResponse(false);
      cancelResponseTimer();
    }
  }, [cancelResponseTimer, sessionData.ask?.askSessionId, sessionData.askKey, isTestMode]);

  const scheduleResponseTimer = useCallback(() => {
    cancelResponseTimer();
    responseTimerRef.current = setTimeout(() => {
      triggerAiResponse();
    }, 3000);
  }, [cancelResponseTimer, triggerAiResponse]);

  useEffect(() => {
    return () => {
      cancelResponseTimer();
    };
  }, [cancelResponseTimer]);

  useEffect(() => {
    setIsDetailsCollapsed(false);
    autoCollapseTriggeredRef.current = false;
    previousMessageCountRef.current = sessionData.messages.length;
  }, [sessionData.ask?.askSessionId]);

  useEffect(() => {
    if (autoCollapseTriggeredRef.current) {
      previousMessageCountRef.current = sessionData.messages.length;
      return;
    }

    if (sessionData.messages.length > previousMessageCountRef.current) {
      const newMessages = sessionData.messages.slice(previousMessageCountRef.current);
      const hasUserMessage = newMessages.some(message => message.senderType === 'user');

      if (hasUserMessage) {
        setIsDetailsCollapsed(true);
        autoCollapseTriggeredRef.current = true;
      }
    }

    previousMessageCountRef.current = sessionData.messages.length;
  }, [sessionData.messages]);

  // Initialize session from URL parameters
  useEffect(() => {
    const key = searchParams.get('key');
    
    if (!key) {
      setSessionData(prev => ({
        ...prev,
        error: 'No ASK key provided in URL. Please use a valid ASK link.'
      }));
      return;
    }

    // Use enhanced validation with detailed error messages
    const validation = validateAskKey(key);
    if (!validation.isValid) {
      setSessionData(prev => ({
        ...prev,
        error: `${validation.error}${validation.suggestion ? `. ${validation.suggestion}` : ''}`
      }));
      return;
    }

    setSessionData(prev => ({
      ...prev,
      askKey: key,
      isLoading: true,
      error: null
    }));

    // Load session data from external backend or test endpoint
    loadSessionData(key);
  }, [searchParams]);

  const handleHumanTyping = useCallback((isTyping: boolean) => {
    if (!awaitingAiResponse) {
      return;
    }

    if (isTyping) {
      cancelResponseTimer();
    } else {
      scheduleResponseTimer();
    }
  }, [awaitingAiResponse, cancelResponseTimer, scheduleResponseTimer]);

  // Load session data from external backend via API
  const loadSessionData = async (key: string) => {
    try {
      // Use test endpoint if in test mode, otherwise use real API
      const endpoint = isTestMode ? `/api/test/${key}` : `/api/ask/${key}`;
      
      const response = await fetch(endpoint);
      const data: ApiResponse<{
        ask: Ask;
        messages: Message[];
        insights?: Insight[];
        challenges?: any[];
      }> = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load session data from backend');
      }

      setSessionData(prev => ({
        ...prev,
        ask: data.data!.ask,
        messages: data.data!.messages,
        insights: data.data?.insights ?? [],
        challenges: data.data?.challenges ?? [],
        isLoading: false,
        error: null
      }));

    } catch (error) {
      console.error('Error loading session data:', error);
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        error: parseErrorMessage(error)
      }));
    }
  };

  // Handle sending messages to database and schedule AI response
  const handleSendMessage = async (
    content: string,
    type: Message['type'] = 'text',
    metadata?: Message['metadata']
  ) => {
    if (!sessionData.askKey) return;

    const timestamp = new Date().toISOString();
    const optimisticId = `temp-${Date.now()}`;
    const senderName = currentParticipantName || 'Vous';
    const optimisticMetadata = {
      ...(metadata ?? {}),
      senderName,
    } as Message['metadata'];

    const optimisticMessage: Message = {
      id: optimisticId,
      askKey: sessionData.askKey,
      askSessionId: sessionData.ask?.askSessionId,
      content,
      type,
      senderType: 'user',
      senderId: null,
      senderName,
      timestamp,
      metadata: optimisticMetadata,
    };

    setSessionData(prev => ({
      ...prev,
      messages: [...prev.messages, optimisticMessage],
      isLoading: true,
    }));

    try {
      const endpoint = isTestMode ? `/api/test/${sessionData.askKey}` : `/api/ask/${sessionData.askKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          type,
          metadata,
          senderName,
          timestamp,
        })
      });

      const data: ApiResponse<{ message: Message }> = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to send message');
      }

      if (data.data?.message) {
        setSessionData(prev => ({
          ...prev,
          messages: prev.messages.map(message =>
            message.id === optimisticId ? data.data!.message : message
          ),
          isLoading: false,
        }));
      } else {
        setSessionData(prev => ({
          ...prev,
          isLoading: false,
        }));
      }

      setAwaitingAiResponse(true);
      scheduleResponseTimer();

    } catch (error) {
      console.error('Error sending message:', error);
      setAwaitingAiResponse(false);
      cancelResponseTimer();
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        messages: prev.messages.filter(message => message.id !== optimisticId),
        error: parseErrorMessage(error)
      }));
    }
  };

  // Retry loading session data
  const retryLoad = () => {
    if (sessionData.askKey) {
      loadSessionData(sessionData.askKey);
    }
  };

  // Clear error
  const clearError = () => {
    setSessionData(prev => ({ ...prev, error: null }));
  };

  // Render error state with beautiful UI
  if (sessionData.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-indigo-200 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card max-w-md w-full"
        >
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="text-center">
              <motion.div
                initial={{ rotate: 0 }}
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mx-auto w-16 h-16 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mb-4"
              >
                <AlertCircle className="h-8 w-8 text-white" />
              </motion.div>
              <CardTitle className="text-xl text-destructive">
                Session Error
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="neumorphic-shadow p-4 rounded-lg">
                <p className="text-muted-foreground text-center">{sessionData.error}</p>
              </div>
              
              {/* Show format example for ASK key errors */}
              {sessionData.error.includes('ASK key') && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="neumorphic-shadow p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50"
                >
                  <p className="text-sm font-medium mb-2 text-primary">Expected URL format:</p>
                  <code className="text-xs bg-white/50 px-2 py-1 rounded text-muted-foreground block">
                    https://your-domain.com/?key=your-ask-key-123
                  </code>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    For testing: add <span className="font-mono bg-yellow-100 px-1 rounded">&mode=test</span>
                  </p>
                </motion.div>
              )}
              
              <div className="flex gap-3 pt-2">
                {sessionData.askKey && (
                  <Button 
                    onClick={retryLoad} 
                    variant="outline" 
                    className="flex-1 neumorphic-raised border-0"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                )}
                <Button 
                  onClick={clearError} 
                  variant="ghost" 
                  className="flex-1 neumorphic-shadow"
                >
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Render loading state with beautiful animations
  if (sessionData.isLoading && !sessionData.ask) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-indigo-200 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card max-w-md w-full"
        >
          <Card className="border-0 bg-transparent shadow-none">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center space-y-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="mx-auto w-16 h-16 bg-gradient-to-r from-primary to-accent rounded-full flex items-center justify-center"
                >
                  <Sparkles className="h-8 w-8 text-white" />
                </motion.div>
                
                <div className="space-y-3">
                  <motion.h3 
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-lg font-semibold text-foreground"
                  >
                    {isTestMode ? 'Loading Test Session' : 'Connecting to Backend'}
                  </motion.h3>
                  
                  <div className="space-y-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        animate={{ x: [-100, 400] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="h-full w-24 bg-gradient-to-r from-primary to-accent"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Please wait while we establish your session...
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-indigo-200">
      {/* Beautiful Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="app-header border-0 sticky top-0 z-50"
      >
        <div className="container mx-auto px-4 sm:px-6 py-3 space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <motion.div
              className="flex items-center gap-2.5"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <div className="w-9 h-9 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center shadow-lg">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold sm:text-xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Agentic Design Flow
                </h1>
                {isTestMode && (
                  <span className="test-mode-badge">TEST MODE</span>
                )}
              </div>
            </motion.div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {sessionData.askKey && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="neumorphic-shadow px-2.5 py-1 rounded-lg bg-white/70 text-xs sm:text-sm"
                >
                  <span className="text-muted-foreground">Session&nbsp;:</span>
                  <span className="font-mono text-foreground ml-1">{sessionData.askKey}</span>
                </motion.div>
              )}

              {sessionData.ask && (
                <motion.span
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={sessionData.ask.isActive ? 'session-active' : 'session-closed'}
                >
                  {sessionData.ask.isActive ? 'Active' : 'Closed'}
                </motion.span>
              )}
            </div>
          </div>

          {askDetails && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-white/50 bg-white/80 backdrop-blur px-4 py-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5 sm:pr-4">
                  <h3 className="font-semibold tracking-tight text-base sm:text-lg leading-snug text-foreground">
                    {askDetails.question}
                  </h3>
                  {askDetails.description && !isDetailsCollapsed && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {askDetails.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDetailsCollapsed(prev => !prev)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap self-start"
                  aria-expanded={!isDetailsCollapsed}
                >
                  {isDetailsCollapsed ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Infos
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Masquer
                    </>
                  )}
                </Button>
              </div>

              <AnimatePresence initial={false}>
                {!isDetailsCollapsed && (
                  <motion.div
                    key="ask-details"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-3 overflow-hidden"
                  >
                    <div className="grid gap-3 sm:gap-4 text-sm text-muted-foreground sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Statut</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                            {statusLabel}
                          </span>
                          {timelineLabel && <span>{timelineLabel}</span>}
                          {timeRemaining && (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{timeRemaining}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Cadre</p>
                        <div className="space-y-1 text-foreground">
                          <p className="font-medium">
                            {getDeliveryModeLabel(askDetails.deliveryMode)}
                          </p>
                          <p className="text-muted-foreground">
                            {getAudienceDescription(askDetails.audienceScope, askDetails.responseMode)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                          Participants ({participants.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {participants.length > 0 ? (
                            participants.map(participant => (
                              <span
                                key={participant.id}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                              >
                                <span className="font-medium text-primary/90">{participant.name}</span>
                                {participant.isSpokesperson && (
                                  <span className="text-[10px] uppercase tracking-wide text-primary/70">porte-parole</span>
                                )}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">Aucun participant pour le moment</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </motion.header>

      {/* Main Content with Beautiful Layout */}
      <main className="flex h-[calc(100vh-88px)] overflow-hidden gap-6 p-6">
        {/* Chat Section - 1/3 of screen with glass effect */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-1/3"
        >
          <div className="chat-container h-full">
            <ChatComponent
              askKey={sessionData.askKey}
              ask={sessionData.ask}
              messages={sessionData.messages}
              onSendMessage={handleSendMessage}
              isLoading={sessionData.isLoading}
              onHumanTyping={handleHumanTyping}
              currentParticipantName={currentParticipantName}
              isMultiUser={Boolean(sessionData.ask && sessionData.ask.participants.length > 1)}
            />
          </div>
        </motion.div>

        {/* Insight Section - 2/3 of screen with enhanced styling */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex-1"
        >
          <div className="h-full flex flex-col overflow-hidden">
            <InsightPanel
              insights={sessionData.insights}
              askKey={sessionData.askKey}
            />
          </div>
        </motion.div>
      </main>

      {/* Floating Error Toast */}
      {sessionData.error && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.8 }}
          className="fixed bottom-6 right-6 max-w-md z-50"
        >
          <div className="error-toast p-4 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-red-400 to-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">Error</p>
                <p className="text-sm text-muted-foreground mt-1">{sessionData.error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearError}
                className="h-8 w-8 p-0 hover:bg-white/20 rounded-full"
              >
                ×
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
