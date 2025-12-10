"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { AlertCircle, Clock, MessageSquare, Sparkles, ChevronDown, ChevronUp, MessageCircle, Lightbulb } from "lucide-react";
import { ChatComponent } from "@/components/chat/ChatComponent";
import { InsightPanel } from "@/components/insight/InsightPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionData, Ask, Message, Insight, Challenge, ApiResponse, ConversationPlan } from "@/types";
import { ConversationProgressBar } from "@/components/conversation/ConversationProgressBar";
import { useSessionTimer } from "@/hooks/useSessionTimer";
import {
  validateAskKey,
  parseErrorMessage,
  formatTimeRemaining,
  getConversationModeDescription,
  getDeliveryModeLabel,
} from "@/lib/utils";
import { UserProfileMenu } from "@/components/auth/UserProfileMenu";
import { supabase } from "@/lib/supabaseClient";

type TokenSessionPayload = {
  ask: Ask;
  messages: Message[];
  insights: Insight[];
  challenges?: Challenge[];
  conversationPlan?: import('@/types').ConversationPlan | null;
  viewer?: {
    participantId?: string | null;
    profileId?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
};

interface MobileLayoutProps {
  sessionData: SessionData;
  currentParticipantName: string | null;
  awaitingAiResponse: boolean;
  voiceModeConfig: {
    systemPrompt: string | null;
    userPrompt: string | null;
    promptVariables: Record<string, string | null | undefined> | null;
    modelConfig: {
      provider?: "deepgram-voice-agent" | "hybrid-voice-agent" | "speechmatics-voice-agent";
      voiceAgentProvider?: "deepgram-voice-agent" | "speechmatics-voice-agent";
      deepgramSttModel?: string;
      deepgramTtsModel?: string;
      deepgramLlmProvider?: "anthropic" | "openai";
      deepgramLlmModel?: string;
      speechmaticsSttLanguage?: string;
      speechmaticsSttOperatingPoint?: "enhanced" | "standard";
      speechmaticsSttMaxDelay?: number;
      speechmaticsSttEnablePartials?: boolean;
      speechmaticsLlmProvider?: "anthropic" | "openai";
      speechmaticsLlmModel?: string;
      speechmaticsApiKeyEnvVar?: string;
      elevenLabsVoiceId?: string;
      elevenLabsModelId?: string;
      promptVariables?: Record<string, string | null | undefined>; // Variables for userPrompt template rendering
    } | null;
  };
  isDetectingInsights: boolean;
  onSendMessage: (content: string, type?: Message['type'], metadata?: Message['metadata']) => void;
  onVoiceMessage: (role: 'user' | 'agent', content: string, metadata?: { isInterim?: boolean; messageId?: string; timestamp?: string }) => void;
  setIsReplyBoxFocused: (focused: boolean) => void;
  setIsVoiceModeActive: (active: boolean) => void;
  isVoiceModeActive: boolean;
  reloadMessagesAfterVoiceMode: () => void;
  onInitConversation: () => void;
  onEditMessage: (messageId: string, newContent: string) => Promise<void>;
  mobileActivePanel: 'chat' | 'insights';
  setMobileActivePanel: (panel: 'chat' | 'insights') => void;
  isMobileHeaderExpanded: boolean;
  setIsMobileHeaderExpanded: (expanded: boolean) => void;
  askDetails: Ask | null;
  sessionDataAskKey: string;
  participants: Array<{ id: string; name: string; isSpokesperson?: boolean }>;
  statusLabel: string;
  timelineLabel: string | null;
  timeRemaining: string | null;
  onInsightUpdate: (insightId: string, newContent: string) => void;
  /** Session timer elapsed minutes */
  sessionElapsedMinutes: number;
  /** Whether the session timer is paused */
  isSessionTimerPaused: boolean;
  /** Notify session timer of user typing */
  onUserTyping: (isTyping: boolean) => void;
}

/**
 * Mobile layout component with collapsible header and swipeable panels
 */
function MobileLayout({
  sessionData,
  currentParticipantName,
  awaitingAiResponse,
  voiceModeConfig,
  isDetectingInsights,
  onSendMessage,
  onVoiceMessage,
  setIsReplyBoxFocused,
  setIsVoiceModeActive,
  isVoiceModeActive,
  reloadMessagesAfterVoiceMode,
  onInitConversation,
  onEditMessage,
  mobileActivePanel,
  setMobileActivePanel,
  isMobileHeaderExpanded,
  setIsMobileHeaderExpanded,
  askDetails,
  sessionDataAskKey,
  participants,
  statusLabel,
  timelineLabel,
  timeRemaining,
  onInsightUpdate,
  sessionElapsedMinutes,
  isSessionTimerPaused,
  onUserTyping,
}: MobileLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setPanelWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (panelWidth === 0) return;
    
    const threshold = panelWidth * 0.25;
    const velocity = info.velocity.x;
    const currentX = mobileActivePanel === 'chat' ? 0 : -panelWidth;
    const newX = currentX + info.offset.x;
    
    // Check velocity first (fast swipe)
    if (Math.abs(velocity) > 500) {
      if (velocity > 0 && mobileActivePanel === 'insights') {
        setMobileActivePanel('chat');
      } else if (velocity < 0 && mobileActivePanel === 'chat') {
        setMobileActivePanel('insights');
      }
    } 
    // Then check position (slow drag)
    else {
      if (newX > -threshold && mobileActivePanel === 'insights') {
        setMobileActivePanel('chat');
      } else if (newX < -threshold && mobileActivePanel === 'chat') {
        setMobileActivePanel('insights');
      }
    }
    
    x.set(0);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-44px)] overflow-hidden min-w-0 w-full max-w-full overflow-x-hidden touch-pan-y">
      {/* Collapsible Header - Compact */}
      {askDetails && (
        <motion.div
          initial={false}
          animate={{
            height: isMobileHeaderExpanded ? 'auto' : '48px',
          }}
          className="overflow-hidden border-b border-white/50 bg-white/80 backdrop-blur flex-shrink-0"
        >
          <div className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-xs leading-tight text-foreground line-clamp-2">
                  {askDetails.question}
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileHeaderExpanded(!isMobileHeaderExpanded)}
                className="flex-shrink-0 h-7 w-7 p-0"
              >
                {isMobileHeaderExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <AnimatePresence>
            {isMobileHeaderExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-4 pb-4"
              >
                {askDetails.description && (
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {askDetails.description}
                  </p>
                )}
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
                      Session
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {sessionDataAskKey && (
                        <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                          {sessionDataAskKey}
                        </span>
                      )}
                      {sessionData.ask && (
                        <span className={sessionData.ask.isActive ? 'session-active' : 'session-closed'}>
                          {sessionData.ask.isActive ? 'Active' : 'Closed'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
                      Statut
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {statusLabel}
                      </span>
                      {timelineLabel && <span className="text-xs text-muted-foreground">{timelineLabel}</span>}
                      {timeRemaining && (
                        <span className="inline-flex items-center gap-1 text-primary text-xs">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{timeRemaining}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
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
                        <span className="text-muted-foreground text-xs">Aucun participant</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Swipeable Panels Container */}
      <div className="flex-1 relative overflow-hidden min-w-0 max-w-full overflow-x-hidden" ref={containerRef}>
        <motion.div
          drag="x"
          dragConstraints={panelWidth > 0 ? { left: -panelWidth, right: 0 } : { left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          style={{ x }}
          className="flex h-full min-w-0 max-w-full"
          animate={{
            x: mobileActivePanel === 'chat' ? 0 : panelWidth > 0 ? -panelWidth : 0,
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
          onAnimationComplete={() => {
            // Reset drag position after animation
            x.set(0);
          }}
        >
          {/* Chat Panel */}
          <motion.div
            className="w-full flex-shrink-0 h-full min-w-0 max-w-full overflow-x-hidden"
            animate={{
              opacity: mobileActivePanel === 'chat' ? 1 : 0.5,
            }}
            transition={{ duration: 0.2 }}
          >
            <div className="h-full flex flex-col min-w-0 max-w-full">
              {sessionData.conversationPlan && (
                <div className="flex-shrink-0">
                  <ConversationProgressBar
                    steps={sessionData.conversationPlan.plan_data.steps}
                    currentStepId={sessionData.conversationPlan.current_step_id}
                    elapsedMinutes={sessionElapsedMinutes}
                    isTimerPaused={isSessionTimerPaused}
                  />
                </div>
              )}
              <div className="flex-1 p-1.5 overflow-y-auto min-w-0 max-w-full overflow-x-hidden">
                <ChatComponent
                  key={`chat-${sessionDataAskKey}`}
                  askKey={sessionDataAskKey}
                  ask={sessionData.ask}
                  messages={sessionData.messages}
                  conversationPlan={sessionData.conversationPlan}
                  onSendMessage={onSendMessage}
                  isLoading={sessionData.isLoading}
                  onHumanTyping={onUserTyping}
                  currentParticipantName={currentParticipantName}
                  isMultiUser={Boolean(sessionData.ask && sessionData.ask.participants.length > 1)}
                  showAgentTyping={awaitingAiResponse && !isDetectingInsights}
                  voiceModeEnabled={!!voiceModeConfig?.systemPrompt}
                  voiceModeSystemPrompt={voiceModeConfig?.systemPrompt || undefined}
                  voiceModeUserPrompt={voiceModeConfig?.userPrompt || undefined}
                  voiceModePromptVariables={voiceModeConfig?.promptVariables || undefined}
                  voiceModeModelConfig={voiceModeConfig?.modelConfig || undefined}
                  onVoiceMessage={onVoiceMessage}
                  onReplyBoxFocusChange={setIsReplyBoxFocused}
                  onInitConversation={onInitConversation}
                  onVoiceModeChange={setIsVoiceModeActive}
                  onEditMessage={onEditMessage}
                />
              </div>
            </div>
          </motion.div>

          {/* Insights Panel */}
          <motion.div
            className="w-full flex-shrink-0 h-full"
            animate={{
              opacity: mobileActivePanel === 'insights' ? 1 : 0.5,
            }}
            transition={{ duration: 0.2 }}
          >
            <div className="h-full p-2 md:p-4 overflow-y-auto">
              <InsightPanel
                insights={sessionData.insights}
                askKey={sessionDataAskKey}
                isDetectingInsights={isDetectingInsights}
                onInsightUpdate={onInsightUpdate}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Panel Indicator - with safe area for mobile browsers */}
      <div className="flex items-center justify-center gap-2 py-2 bg-white/50 backdrop-blur border-t border-white/50" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        <button
          onClick={() => setMobileActivePanel('chat')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
            mobileActivePanel === 'chat'
              ? 'bg-primary text-white shadow-md'
              : 'bg-white/80 text-muted-foreground'
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Chat</span>
        </button>
        <button
          onClick={() => setMobileActivePanel('insights')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
            mobileActivePanel === 'insights'
              ? 'bg-primary text-white shadow-md'
              : 'bg-white/80 text-muted-foreground'
          }`}
        >
          <Lightbulb className="h-4 w-4" />
          <span className="text-sm font-medium">Insights</span>
        </button>
      </div>
    </div>
  );
}

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
    conversationPlan: null,
    isLoading: false,
    error: null
  });
  const responseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const insightDetectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasPostedMessageSinceRefreshRef = useRef(false);
  const [awaitingAiResponse, setAwaitingAiResponse] = useState(false);
  const activeAiResponsesRef = useRef(0);
  const [isDetectingInsights, setIsDetectingInsights] = useState(false);
  const participantFromUrl = searchParams.get('participant') || searchParams.get('participantName');
  const derivedParticipantName = participantFromUrl?.trim() ? participantFromUrl.trim() : null;
  const [currentParticipantName, setCurrentParticipantName] = useState<string | null>(derivedParticipantName);
  const isTestMode = searchParams.get('mode') === 'test';
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);
  const [isReplyBoxFocused, setIsReplyBoxFocused] = useState(false);
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);

  // Session timer with intelligent pause/resume logic and persistence
  const sessionTimer = useSessionTimer({
    inactivityTimeout: 30000, // 30 seconds before pause
    askKey: sessionData.askKey || undefined, // Enable persistence when askKey is available
    inviteToken: sessionData.inviteToken,
  });

  const autoCollapseTriggeredRef = useRef(false);
  const previousMessageCountRef = useRef(0);
  // Mobile view states
  const [mobileActivePanel, setMobileActivePanel] = useState<'chat' | 'insights'>('chat');
  const [isMobileHeaderExpanded, setIsMobileHeaderExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // DEBUG: Afficher auth ID temporairement
  const [debugAuthId, setDebugAuthId] = useState<string | null>(null);
  // Voice mode configuration
  // Voice mode configuration - combined into a single state to avoid multiple re-renders
  const [voiceModeConfig, setVoiceModeConfig] = useState<{
    systemPrompt: string | null;
    userPrompt: string | null;
    promptVariables: Record<string, string | null | undefined> | null;
    modelConfig: {
      provider?: "deepgram-voice-agent" | "hybrid-voice-agent" | "speechmatics-voice-agent";
      voiceAgentProvider?: "deepgram-voice-agent" | "speechmatics-voice-agent";
      deepgramSttModel?: string;
      deepgramTtsModel?: string;
      deepgramLlmProvider?: "anthropic" | "openai";
      deepgramLlmModel?: string;
      speechmaticsSttLanguage?: string;
      speechmaticsSttOperatingPoint?: "enhanced" | "standard";
      speechmaticsSttMaxDelay?: number;
      speechmaticsSttEnablePartials?: boolean;
      speechmaticsLlmProvider?: "anthropic" | "openai";
      speechmaticsLlmModel?: string;
      speechmaticsApiKeyEnvVar?: string;
      elevenLabsVoiceId?: string;
      elevenLabsModelId?: string;
      promptVariables?: Record<string, string | null | undefined>; // Variables for userPrompt template rendering
    } | null;
  }>({
    systemPrompt: null,
    userPrompt: null,
    promptVariables: null,
    modelConfig: null,
  });
  // Store logId for voice agent exchanges (user message -> agent response)
  const voiceAgentLogIdRef = useRef<string | null>(null);
  const inviteTokenRef = useRef<string | null>(null);

  const startAwaitingAiResponse = useCallback(() => {
    activeAiResponsesRef.current += 1;
    setAwaitingAiResponse(true);
  }, [setAwaitingAiResponse]);

  const stopAwaitingAiResponse = useCallback(() => {
    activeAiResponsesRef.current = Math.max(0, activeAiResponsesRef.current - 1);
    setAwaitingAiResponse(activeAiResponsesRef.current > 0);
  }, [setAwaitingAiResponse]);

  // Connect AI streaming state to session timer
  useEffect(() => {
    sessionTimer.notifyAiStreaming(awaitingAiResponse);
  }, [awaitingAiResponse, sessionTimer]);

  // Connect voice mode state to session timer
  useEffect(() => {
    sessionTimer.notifyVoiceActive(isVoiceModeActive);
  }, [isVoiceModeActive, sessionTimer]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) {
        setDebugAuthId(data.user.id);
      }
    });
  }, []);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const askDetails = sessionData.ask;
  useEffect(() => {
    if (sessionData.inviteToken) {
      inviteTokenRef.current = sessionData.inviteToken;
    }
  }, [sessionData.inviteToken]);
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

  const cancelInsightDetectionTimer = useCallback(() => {
    if (insightDetectionTimerRef.current) {
      clearTimeout(insightDetectionTimerRef.current);
      insightDetectionTimerRef.current = null;
      setIsDetectingInsights(false);
    }
  }, []);

  const markMessagePosted = useCallback(() => {
    hasPostedMessageSinceRefreshRef.current = true;
  }, []);

  const triggerAiResponse = useCallback(async () => {
    if (!sessionData.askKey) {
      return;
    }

    try {
      cancelInsightDetectionTimer();
      setIsDetectingInsights(true);
      setSessionData(prev => ({
        ...prev,
        isLoading: true,
      }));

      if (isTestMode) {
        const simulatedId = `ai-${Date.now()}`;
        const simulatedAiMessage: Message = {
          clientId: simulatedId,
          id: simulatedId,
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

        markMessagePosted();
        setSessionData(prev => ({
          ...prev,
          messages: [...prev.messages, simulatedAiMessage],
          isLoading: false,
        }));
        return;
      }

      const insightHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (sessionData.inviteToken) {
        insightHeaders['X-Invite-Token'] = sessionData.inviteToken;
      }

      const response = await fetch(`/api/ask/${sessionData.askKey}/respond`, {
        method: 'POST',
        headers: insightHeaders,
        body: JSON.stringify({ mode: 'insights-only' }),
      });

      const data: ApiResponse<{ message?: Message; insights?: Insight[] }> = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Unable to trigger insight detection (status ${response.status})`);
      }

      const payload = data.data;
      const message = payload?.message;
      const insights = payload?.insights;

      if (message) {
        markMessagePosted();
        setSessionData(prev => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              ...message,
              clientId: message.clientId ?? message.id,
            },
          ],
          insights: insights ?? prev.insights,
          isLoading: false,
        }));
      } else if (insights) {
        setSessionData(prev => ({
          ...prev,
          insights: insights ?? prev.insights,
          isLoading: false,
        }));
      } else {
        setSessionData(prev => ({
          ...prev,
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error('Unable to trigger insight detection', error);
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        error: parseErrorMessage(error)
      }));
    } finally {
      setIsDetectingInsights(false);
    }
  }, [cancelInsightDetectionTimer, cancelResponseTimer, sessionData.ask?.askSessionId, sessionData.askKey, sessionData.inviteToken, isTestMode]);

  const scheduleResponseTimer = useCallback(() => {
    cancelResponseTimer();
    responseTimerRef.current = setTimeout(() => {
      triggerAiResponse();
    }, 3000);
  }, [cancelResponseTimer, triggerAiResponse]);

  const triggerInsightDetection = useCallback(async () => {
    if (!sessionData.askKey || !sessionData.ask?.askSessionId) {
      setIsDetectingInsights(false);
      return;
    }

    if (!hasPostedMessageSinceRefreshRef.current) {
      setIsDetectingInsights(false);
      return;
    }

    try {
      setIsDetectingInsights(true);
      
      const detectionHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (sessionData.inviteToken) {
        detectionHeaders['X-Invite-Token'] = sessionData.inviteToken;
      }

      const response = await fetch(`/api/ask/${sessionData.askKey}/respond`, {
        method: 'POST',
        headers: detectionHeaders,
        body: JSON.stringify({
          detectInsights: true,
          askSessionId: sessionData.ask.askSessionId,
        }),
      });

      const data: ApiResponse<{ insights: Insight[] }> = await response.json();

      if (data.success && data.data?.insights) {
        setSessionData(prev => ({
          ...prev,
          insights: data.data!.insights,
        }));
      }
    } catch (error) {
      console.error('Error detecting insights:', error);
    } finally {
      setIsDetectingInsights(false);
    }
  }, [sessionData.askKey, sessionData.ask?.askSessionId, sessionData.inviteToken]);

  const scheduleInsightDetection = useCallback(() => {
    if (
      !hasPostedMessageSinceRefreshRef.current ||
      !sessionData.askKey ||
      !sessionData.ask?.askSessionId
    ) {
      return;
    }

    cancelInsightDetectionTimer();
    insightDetectionTimerRef.current = setTimeout(() => {
      setIsDetectingInsights(true);
      triggerInsightDetection();
    }, 2500); // 2.5 secondes après le dernier message
  }, [
    cancelInsightDetectionTimer,
    triggerInsightDetection,
    sessionData.ask?.askSessionId,
    sessionData.askKey,
  ]);

  useEffect(() => {
    return () => {
      cancelResponseTimer();
      cancelInsightDetectionTimer();
    };
  }, [cancelResponseTimer, cancelInsightDetectionTimer]);

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

  // Auto-collapse details when reply box gets focus
  useEffect(() => {
    if (isReplyBoxFocused && !isDetailsCollapsed) {
      setIsDetailsCollapsed(true);
      autoCollapseTriggeredRef.current = true;
    }
  }, [isReplyBoxFocused, isDetailsCollapsed]);

  // Initialize session from URL parameters
  useEffect(() => {
    // Try multiple ways to get the key or token
    const keyFromSearchParams = searchParams.get('key');
    const tokenFromSearchParams = searchParams.get('token');
    const keyFromURL = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('key') : null;
    const tokenFromURL = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null;
    
    const key = keyFromSearchParams || keyFromURL;
    const token = tokenFromSearchParams || tokenFromURL;
    
    console.log('🔍 Debug - Key from searchParams:', keyFromSearchParams);
    console.log('🔍 Debug - Token from searchParams:', tokenFromSearchParams);
    console.log('🔍 Debug - Final key:', key);
    console.log('🔍 Debug - Final token:', token);
    console.log('🔍 Debug - All search params:', Object.fromEntries(searchParams.entries()));
    console.log('🔍 Debug - Window location:', typeof window !== 'undefined' ? window.location.href : 'undefined');
    
    // If we have a token, use it; otherwise use key
    if (token) {
      // Token-based link (unique per participant)
      setSessionData(prev => ({
        ...prev,
        askKey: '', // Will be set after loading
        inviteToken: token, // Store the invite token for authentication
        ask: null,
        messages: [],
        insights: [],
        challenges: [],
        isLoading: true,
        error: null
      }));
      hasPostedMessageSinceRefreshRef.current = false;
      // Load session data using token endpoint
      loadSessionDataByToken(token);
      return;
    }
    
    if (!key) {
      setSessionData(prev => ({
        ...prev,
        error: 'No ASK key or token provided in URL. Please use a valid ASK link.'
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
      ask: null,
      messages: [],
      insights: [],
      challenges: [],
      isLoading: true,
      error: null
    }));

    hasPostedMessageSinceRefreshRef.current = false;

    // Load session data from external backend or test endpoint
    loadSessionData(key);
  }, [searchParams]);

  const handleHumanTyping = useCallback((isTyping: boolean) => {
    if (isTyping) {
      cancelResponseTimer();
      cancelInsightDetectionTimer();
    } else {
      if (awaitingAiResponse) {
        scheduleResponseTimer();
      } else {
        // Si l'utilisateur arrête de taper et qu'aucune réponse AI n'est en cours,
        // programmer la détection d'insights
        if (hasPostedMessageSinceRefreshRef.current) {
          scheduleInsightDetection();
        }
      }
    }
  }, [awaitingAiResponse, cancelResponseTimer, scheduleResponseTimer, cancelInsightDetectionTimer, scheduleInsightDetection]);

  // Load session data from external backend via API
  const loadSessionDataByToken = async (token: string) => {
    try {
      setSessionData(prev => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      const response = await fetch(`/api/ask/token/${encodeURIComponent(token)}`);
      const data: ApiResponse<TokenSessionPayload> = await response.json();

      if (!response.ok || !data.success) {
        // If authentication is required, redirect to login with token preserved
        if (response.status === 401) {
          const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
          const loginUrl = `/auth/login?redirectTo=${encodeURIComponent(currentUrl)}`;
          if (typeof window !== 'undefined') {
            window.location.href = loginUrl;
            return;
          }
        }
        throw new Error(data.error || 'Failed to load session data from token');
      }

      const hasPersistedMessages = (data.data?.messages ?? []).length > 0;
      hasPostedMessageSinceRefreshRef.current = hasPersistedMessages;

      setSessionData(prev => {
        const messagesWithClientIds = (data.data?.messages ?? []).map(message => {
          const existing = prev.messages.find(prevMessage => prevMessage.id === message.id);
          return {
            ...message,
            clientId: existing?.clientId ?? message.clientId ?? message.id,
          };
        });

        // Update askKey to the actual ask key from the response
        const actualAskKey = data.data?.ask?.key || token;

        return {
          ...prev,
          askKey: actualAskKey,
          inviteToken: token, // Keep the token for subsequent API calls
          ask: data.data!.ask,
          messages: messagesWithClientIds,
          insights: data.data?.insights ?? [],
          challenges: data.data?.challenges ?? [],
          conversationPlan: data.data?.conversationPlan ?? null,
          isLoading: false,
          error: null,
        };
      });

      const viewerName = data.data?.viewer?.name ?? data.data?.viewer?.email ?? derivedParticipantName ?? null;
      setCurrentParticipantName(viewerName);

    } catch (error) {
      console.error('Error loading session data by token:', error);
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        error: parseErrorMessage(error)
      }));
    }
  };

  const loadSessionData = async (key: string) => {
    try {
      console.log('🔍 Debug - loadSessionData called with key:', key);
      console.log('🔍 Debug - isTestMode:', isTestMode);
      
      // Use test endpoint if in test mode, otherwise use real API
      const endpoint = isTestMode ? `/api/test/${key}` : `/api/ask/${key}`;
      console.log('🔍 Debug - endpoint:', endpoint);
      
      const headers: Record<string, string> = {};
      if (inviteTokenRef.current) {
        headers['X-Invite-Token'] = inviteTokenRef.current;
        console.log('[HomePage] 🔐 Including invite token header for loadSessionData');
      }
      
      const response = await fetch(endpoint, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
      const data: ApiResponse<{
        ask: Ask;
        messages: Message[];
        insights?: Insight[];
        challenges?: any[];
        conversationPlan?: ConversationPlan | null;
      }> = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load session data from backend');
      }

      const hasPersistedMessages = (data.data?.messages ?? []).length > 0;
      hasPostedMessageSinceRefreshRef.current = hasPersistedMessages;

      console.log('[HomePage] 📥 Loaded messages from API:', {
        messageCount: (data.data?.messages ?? []).length,
        voiceMessages: (data.data?.messages ?? []).filter(m => 
          m.metadata?.voiceTranscribed || m.metadata?.voiceGenerated
        ).length,
        allMessages: (data.data?.messages ?? []).map(m => ({
          id: m.id,
          content: m.content.substring(0, 50),
          senderType: m.senderType,
          hasVoiceMetadata: !!(m.metadata?.voiceTranscribed || m.metadata?.voiceGenerated)
        }))
      });

      console.log('[HomePage] 💡 Loaded insights from API:', {
        insightCount: (data.data?.insights ?? []).length,
        insights: (data.data?.insights ?? []).map(i => ({
          id: i.id,
          type: i.type,
          contentPreview: i.content?.substring(0, 100),
          summary: i.summary
        }))
      });

      setSessionData(prev => {
        const messagesWithClientIds = (data.data?.messages ?? []).map(message => {
          const existing = prev.messages.find(prevMessage => prevMessage.id === message.id);
          return {
            ...message,
            clientId: existing?.clientId ?? message.clientId ?? message.id,
          };
        });

        console.log('[HomePage] 📝 Setting session data with messages:', {
          previousCount: prev.messages.length,
          newCount: messagesWithClientIds.length,
          newMessages: messagesWithClientIds.filter(m => 
            !prev.messages.find(pm => pm.id === m.id)
          ).map(m => ({
            id: m.id,
            content: m.content.substring(0, 50),
            senderType: m.senderType
          }))
        });

        return {
          ...prev,
          ask: data.data!.ask,
          messages: messagesWithClientIds,
          insights: data.data?.insights ?? [],
          challenges: data.data?.challenges ?? [],
          conversationPlan: data.data?.conversationPlan ?? null,
          isLoading: false,
          error: null,
        };
      });

      setCurrentParticipantName(derivedParticipantName);

    } catch (error) {
      console.error('Error loading session data:', error);
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        error: parseErrorMessage(error)
      }));
    }
  };

  // Handle initializing conversation when textarea gets focus and no messages exist
  const handleInitConversation = useCallback(async () => {
    // Only initiate if there are no messages
    if (sessionData.messages.length > 0) {
      return;
    }

    if (!sessionData.askKey) {
      return;
    }

    try {
      console.log('💬 HomePage: Initiating conversation on textarea focus');

      const endpoint = `/api/ask/${sessionData.askKey}/init`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (sessionData.inviteToken) {
        headers['X-Invite-Token'] = sessionData.inviteToken;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
      });

      const data: ApiResponse<{ message: Message | null }> = await response.json();

      if (!data.success) {
        console.error('Failed to initiate conversation:', data.error);
        return;
      }

      // If a message was created, add it to the state
      if (data.data?.message) {
        setSessionData(prev => ({
          ...prev,
          messages: [...prev.messages, data.data!.message!],
        }));
        console.log('✅ HomePage: Initial conversation message added:', data.data.message.id);
      }
    } catch (error) {
      console.error('Error initiating conversation:', error);
    }
  }, [sessionData.messages.length, sessionData.askKey, sessionData.inviteToken]);


  // Handle voice mode messages
  // Track current streaming message ID to update the same message
  const currentStreamingMessageIdRef = useRef<string | null>(null);
  const currentStreamingMessageClientIdRef = useRef<string | null>(null);

  const handleVoiceMessage = useCallback(async (
    role: 'user' | 'agent',
    content: string,
    metadata?: { isInterim?: boolean; messageId?: string; timestamp?: string }
  ) => {
    if (!sessionData.askKey || !content.trim()) return;

    const isInterim = metadata?.isInterim || false;
    const messageId = metadata?.messageId;
    const timestamp = metadata?.timestamp || new Date().toISOString();
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    if (role === 'user') {
      const senderName = currentParticipantName || 'Vous';
      
      // If this is an interim message with messageId, update the existing message
      // Logic: add to the same message until we get an agent response
      if (isInterim && messageId) {
        // Check if we have a current streaming message
        if (currentStreamingMessageIdRef.current === messageId && currentStreamingMessageClientIdRef.current) {
          // Update existing message
          setSessionData(prev => {
            const messageIndex = prev.messages.findIndex(
              msg => msg.clientId === currentStreamingMessageClientIdRef.current
            );
            
            if (messageIndex >= 0) {
              const updated = [...prev.messages];
              updated[messageIndex] = {
                ...updated[messageIndex],
                content, // Update content
                timestamp, // Update timestamp
              };
              return { ...prev, messages: updated };
            }
            
            // Message not found, create new one
            const optimisticMessage: Message = {
              clientId: optimisticId,
              id: optimisticId,
              askKey: sessionData.askKey,
              askSessionId: sessionData.ask?.askSessionId,
              content,
              type: 'text',
              senderType: 'user',
              senderId: null,
              senderName,
              timestamp,
              metadata: {
                voiceTranscribed: true,
                senderName,
                messageId, // Store messageId in metadata
                isInterim: true, // Mark as interim for typewriter effect
              },
            };
            currentStreamingMessageClientIdRef.current = optimisticId;
            return { ...prev, messages: [...prev.messages, optimisticMessage] };
          });
          return; // Don't persist interim messages
        } else {
          // New streaming message, create it
          currentStreamingMessageIdRef.current = messageId;
          const optimisticMessage: Message = {
            clientId: optimisticId,
            id: optimisticId,
            askKey: sessionData.askKey,
            askSessionId: sessionData.ask?.askSessionId,
            content,
            type: 'text',
            senderType: 'user',
            senderId: null,
            senderName,
            timestamp,
            metadata: {
              voiceTranscribed: true,
              senderName,
              messageId, // Store messageId in metadata
            },
          };
          currentStreamingMessageClientIdRef.current = optimisticId;

          setSessionData(prev => ({
            ...prev,
            messages: [...prev.messages, optimisticMessage],
          }));
          return; // Don't persist interim messages
        }
      }
      
      // Final message (not interim) - update existing if it exists, otherwise create new
      if (!isInterim && messageId && currentStreamingMessageIdRef.current === messageId) {
        // Update the existing streaming message to final
        setSessionData(prev => {
          const messageIndex = prev.messages.findIndex(
            msg => msg.clientId === currentStreamingMessageClientIdRef.current
          );
          
          if (messageIndex >= 0) {
            const updated = [...prev.messages];
            updated[messageIndex] = {
              ...updated[messageIndex],
              content, // Final content
              timestamp, // Final timestamp
              metadata: {
                ...updated[messageIndex].metadata,
                messageId, // Preserve messageId in metadata
                isInterim: false, // Mark as final for instant display
              },
            };
            return { ...prev, messages: updated };
          }
          
          // Message not found, create new one
          const optimisticMessage: Message = {
            clientId: optimisticId,
            id: optimisticId,
            askKey: sessionData.askKey,
            askSessionId: sessionData.ask?.askSessionId,
            content,
            type: 'text',
            senderType: 'user',
            senderId: null,
            senderName,
            timestamp,
            metadata: {
              voiceTranscribed: true,
              senderName,
              messageId, // Store messageId in metadata
            },
          };
          return { ...prev, messages: [...prev.messages, optimisticMessage] };
        });
      } else if (!isInterim) {
        // Final message without messageId or different messageId - create new
        const optimisticMessage: Message = {
          clientId: optimisticId,
          id: optimisticId,
          askKey: sessionData.askKey,
          askSessionId: sessionData.ask?.askSessionId,
          content,
          type: 'text',
          senderType: 'user',
          senderId: null,
          senderName,
          timestamp,
          metadata: {
            voiceTranscribed: true,
            senderName,
            messageId, // Store messageId in metadata if available
            isInterim: false, // Final message
          },
        };

        setSessionData(prev => ({
          ...prev,
          messages: [...prev.messages, optimisticMessage],
        }));
      } else {
        // Interim without messageId - skip (shouldn't happen but handle gracefully)
        return;
      }
      
      // Clear streaming message refs if this is a final message
      if (!isInterim) {
        currentStreamingMessageIdRef.current = null;
        currentStreamingMessageClientIdRef.current = null;
      }

      // Persist the message to database (without triggering AI response)
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        const inviteToken = inviteTokenRef.current || sessionData.inviteToken || null;
        if (inviteToken) {
          headers['X-Invite-Token'] = inviteToken;
          console.log('[HomePage] 🔑 Using invite token for voice user message:', inviteToken.substring(0, 8) + '...');
        } else {
        }

        const endpoint = isTestMode ? `/api/test/${sessionData.askKey}` : `/api/ask/${sessionData.askKey}`;
        console.log('[HomePage] 📤 Persisting voice user message:', {
          endpoint,
          hasInviteToken: !!inviteTokenRef.current,
          contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
          contentLength: content.length,
        });
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content,
            type: 'text',
            metadata: { 
              voiceTranscribed: true,
              messageId, // Preserve messageId in metadata for deduplication
            },
            senderName,
            timestamp,
          }),
        });
        
        console.log('[HomePage] 📥 Voice user message response:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        let data: ApiResponse<{ message: Message }>;
        try {
          data = await response.json();
        } catch (jsonError) {
          console.error('[HomePage] ❌ Failed to parse response JSON:', jsonError);
          const text = await response.text();
          console.error('[HomePage] ❌ Response text:', text);
          throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }

        if (!response.ok) {
          const errorMessage = data.error || `Erreur ${response.status}: ${response.statusText}`;
          console.error('[HomePage] ❌ Voice user message persistence failed:', {
            status: response.status,
            statusText: response.statusText,
            error: errorMessage,
            data: data
          });
          
          // Show user-friendly error message
          setSessionData(prev => ({
            ...prev,
            error: errorMessage,
            messages: prev.messages.filter(msg => msg.clientId !== optimisticId)
          }));
          
          return;
        }

        if (response.ok && data.success && data.data?.message) {
          markMessagePosted();
          const persistedMessage = data.data.message;
          
          // Create log for user message
          try {
            const logResponse = await fetch(`/api/ask/${sessionData.askKey}/voice-agent/log`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(sessionData.inviteToken ? { 'X-Invite-Token': sessionData.inviteToken } : {}),
              },
              body: JSON.stringify({
                role: 'user',
                content,
                messageId: persistedMessage.id,
              }),
            });

            const logData: ApiResponse<{ logId: string }> = await logResponse.json();
            if (logResponse.ok && logData.success && logData.data?.logId) {
              voiceAgentLogIdRef.current = logData.data.logId;
            }
          } catch (error) {
            console.error('Error creating voice agent log:', error);
          }

          setSessionData(prev => ({
            ...prev,
            messages: prev.messages.map(msg =>
              msg.clientId === optimisticId
                ? { ...persistedMessage, clientId: msg.clientId ?? optimisticId }
                : msg
            ),
          }));
          
          console.log('[HomePage] ✅ Voice user message persisted:', {
            messageId: persistedMessage.id,
            content: persistedMessage.content.substring(0, 50)
          });
        } else {
          console.warn('[HomePage] ⚠️ Voice user message persistence failed:', {
            responseOk: response.ok,
            dataSuccess: data.success,
            hasMessage: !!data.data?.message
          });
        }
      } catch (error) {
        console.error('Error persisting voice user message:', error);
      }
    } else {
      // Agent response - clear streaming message refs to allow new user message
      // This allows the next user message to create a new message instead of updating the previous one
      currentStreamingMessageIdRef.current = null;
      currentStreamingMessageClientIdRef.current = null;
      
      // Create AI message from agent response
      const optimisticMessage: Message = {
        clientId: optimisticId,
        id: optimisticId,
        askKey: sessionData.askKey,
        askSessionId: sessionData.ask?.askSessionId,
        content: content,
        type: 'text',
        senderType: 'ai',
        senderId: null,
        senderName: 'Agent',
        timestamp: timestamp,
        metadata: {
          voiceGenerated: true,
        },
      };

      markMessagePosted();
      setSessionData(prev => ({
        ...prev,
        messages: [...prev.messages, optimisticMessage],
      }));

      // Persist the message to database
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (sessionData.inviteToken) {
          headers['X-Invite-Token'] = sessionData.inviteToken;
        }

        const response = await fetch(`/api/ask/${sessionData.askKey}/respond`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: content,
            type: 'text',
            metadata: { voiceGenerated: true },
          }),
        });

        const data: ApiResponse<{ message?: Message; insights?: Insight[] }> = await response.json();

        if (response.ok && data.success && data.data?.message) {
          // Complete log for agent response
          if (voiceAgentLogIdRef.current) {
            try {
              await fetch(`/api/ask/${sessionData.askKey}/voice-agent/log`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(sessionData.inviteToken ? { 'X-Invite-Token': sessionData.inviteToken } : {}),
                },
                body: JSON.stringify({
                  role: 'agent',
                  content,
                  logId: voiceAgentLogIdRef.current,
                }),
              });
              voiceAgentLogIdRef.current = null; // Reset after completing
            } catch (error) {
              console.error('Error completing voice agent log:', error);
            }
          }

          setSessionData(prev => ({
            ...prev,
            messages: prev.messages.map(msg =>
              msg.clientId === optimisticId
                ? { ...data.data!.message!, clientId: msg.clientId ?? optimisticId }
                : msg
            ),
            insights: data.data?.insights ?? prev.insights,
          }));
          
          console.log('[HomePage] ✅ Voice agent message persisted:', {
            messageId: data.data!.message!.id,
            content: data.data!.message!.content.substring(0, 50)
          });
        } else {
          console.warn('[HomePage] ⚠️ Voice agent message persistence failed:', {
            responseOk: response.ok,
            dataSuccess: data.success,
            hasMessage: !!data.data?.message
          });
        }
      } catch (error) {
        console.error('Error persisting voice message:', error);
      }
    }
  }, [sessionData.askKey, sessionData.ask?.askSessionId, sessionData.inviteToken, markMessagePosted, currentParticipantName, isTestMode]);


  // Load voice mode configuration
  const loadVoiceModeConfig = useCallback(async () => {
    console.log('[HomePage] 🎤 loadVoiceModeConfig called', {
      askSessionId: sessionData.ask?.askSessionId,
      askKey: sessionData.askKey,
    });
    
    if (!sessionData.ask?.askSessionId) {
      console.log('[HomePage] ⚠️ loadVoiceModeConfig: No askSessionId, skipping');
      return;
    }

    try {
      // Build API URL with token if available
      const apiUrl = new URL(`/api/ask/${sessionData.askKey}/agent-config`, window.location.origin);
      if (sessionData.inviteToken) {
        apiUrl.searchParams.set('token', sessionData.inviteToken);
      }

      console.log('[HomePage] 🎤 Fetching voice config from:', apiUrl.toString());

      const response = await fetch(apiUrl.toString());
      console.log('[HomePage] 🎤 Voice config response:', {
        status: response.status,
        ok: response.ok,
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[HomePage] 🎤 Voice config data received:', {
          success: data.success,
          hasSystemPrompt: !!data.data?.systemPrompt,
          hasUserPrompt: !!data.data?.userPrompt,
          hasModelConfig: !!data.data?.modelConfig,
          systemPromptLength: data.data?.systemPrompt?.length || 0,
          modelConfigProvider: data.data?.modelConfig?.provider,
        });
        
        if (data.success && data.data) {
          console.log('[HomePage] 🎤 Setting voice mode prompts...', {
            systemPrompt: data.data.systemPrompt ? `${data.data.systemPrompt.substring(0, 100)}...` : null,
            userPrompt: data.data.userPrompt ? `${data.data.userPrompt.substring(0, 100)}...` : null,
          });

          // CRITICAL: Set all voice config in ONE setState to avoid multiple re-renders
          const modelConfig = data.data.modelConfig;
          if (modelConfig) {
            console.log('[HomePage] 🎤 Loading voice mode config:', {
              provider: modelConfig.provider,
              voiceAgentProvider: modelConfig.voiceAgentProvider,
              speechmaticsLlmModel: modelConfig.speechmaticsLlmModel,
              speechmaticsLlmProvider: modelConfig.speechmaticsLlmProvider,
            });

            setVoiceModeConfig({
              systemPrompt: data.data.systemPrompt || null,
              userPrompt: data.data.userPrompt || null,
              promptVariables: data.data.promptVariables || null,
              modelConfig: {
                provider: modelConfig.provider,
                voiceAgentProvider: modelConfig.voiceAgentProvider,
                deepgramSttModel: modelConfig.deepgramSttModel,
                deepgramTtsModel: modelConfig.deepgramTtsModel,
                deepgramLlmProvider: modelConfig.deepgramLlmProvider,
                deepgramLlmModel: modelConfig.deepgramLlmModel,
                speechmaticsSttLanguage: modelConfig.speechmaticsSttLanguage,
                speechmaticsSttOperatingPoint: modelConfig.speechmaticsSttOperatingPoint,
                speechmaticsSttMaxDelay: modelConfig.speechmaticsSttMaxDelay,
                speechmaticsSttEnablePartials: modelConfig.speechmaticsSttEnablePartials,
                speechmaticsLlmProvider: modelConfig.speechmaticsLlmProvider,
                speechmaticsLlmModel: modelConfig.speechmaticsLlmModel,
                speechmaticsApiKeyEnvVar: modelConfig.speechmaticsApiKeyEnvVar,
                elevenLabsVoiceId: modelConfig.elevenLabsVoiceId,
                elevenLabsModelId: modelConfig.elevenLabsModelId,
                promptVariables: data.data.promptVariables || undefined,
              } as any,
            });

            console.log('[HomePage] ✅ Voice mode configuration loaded successfully!');
          } else {
            console.log('[HomePage] ⚠️ No model config in response, using defaults');
            // Use default config when no model config is available
            setVoiceModeConfig({
              systemPrompt: data.data.systemPrompt || null,
              userPrompt: data.data.userPrompt || null,
              promptVariables: data.data.promptVariables || null,
              modelConfig: {
                deepgramSttModel: 'nova-3',
                deepgramTtsModel: 'aura-2-thalia-en',
                deepgramLlmProvider: 'anthropic',
                deepgramLlmModel: undefined,
              },
            });
          }
        } else {
          console.log('[HomePage] ⚠️ Voice config response not successful or missing data');
        }
      } else {
        console.error('[HomePage] ❌ Voice config request failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('[HomePage] ❌ Error response:', errorText);
      }
    } catch (error) {
      console.error('[HomePage] ❌ Error loading voice mode config:', error);
    }
  }, [sessionData.askKey, sessionData.ask?.askSessionId]);

  // Load voice mode config when session loads
  useEffect(() => {
    if (sessionData.ask?.askSessionId) {
      loadVoiceModeConfig();
    }
  }, [sessionData.ask?.askSessionId, loadVoiceModeConfig]);

  // Handle streaming AI response
  const handleStreamingResponse = useCallback(async (latestUserMessageContent?: string): Promise<boolean> => {
    if (!sessionData.askKey) return false;

    // Annuler la détection d'insights pendant le streaming
    cancelInsightDetectionTimer();
    console.log('Starting streaming response for askKey:', sessionData.askKey);

    try {
      const currentAskKey = sessionData.askKey;
      const currentAskSessionId = sessionData.ask?.askSessionId || '';

      const streamHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (sessionData.inviteToken) {
        streamHeaders['X-Invite-Token'] = sessionData.inviteToken;
      }

      // Use functional form to get latest messages without adding to dependencies
      let bodyMessage = latestUserMessageContent && latestUserMessageContent.trim().length > 0
        ? latestUserMessageContent
        : '';

      if (!bodyMessage) {
        // Get last message from state using functional update
        const lastMessage = await new Promise<string>((resolve) => {
          setSessionData(prev => {
            const lastMsg = prev.messages[prev.messages.length - 1]?.content || '';
            resolve(lastMsg);
            return prev; // Don't modify state
          });
        });
        bodyMessage = lastMessage;
      }

      const response = await fetch(`/api/ask/${currentAskKey}/stream`, {
        method: 'POST',
        headers: streamHeaders,
        body: JSON.stringify({
          message: bodyMessage,
          model: 'anthropic', // Par défaut Anthropic, peut être changé
        }),
      });

      console.log('Streaming response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let streamingMessage = '';
      let insightsUpdatedDuringStream = false;

      // Add a temporary streaming message
      const streamingId = `streaming-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const streamingMessageObj: Message = {
        clientId: streamingId,
        id: streamingId,
        askKey: currentAskKey,
        askSessionId: currentAskSessionId,
        content: '',
        type: 'text',
        senderType: 'ai',
        senderId: null,
        senderName: 'Agent',
        timestamp: new Date().toISOString(),
        metadata: {},
      };

      setSessionData(prev => ({
        ...prev,
        messages: [...prev.messages, streamingMessageObj],
      }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data.trim()) {
              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'chunk' && parsed.content) {
                  streamingMessage += parsed.content;
                  setSessionData(prev => ({
                    ...prev,
                    messages: prev.messages.map(msg =>
                      msg.clientId === streamingId
                        ? { ...msg, content: streamingMessage }
                        : msg
                    ),
                  }));
                } else if (parsed.type === 'message' && parsed.message) {
                  // Replace the streaming message with the final one
                  markMessagePosted();
                  setSessionData(prev => ({
                    ...prev,
                    messages: prev.messages.map(msg =>
                      msg.clientId === streamingId
                        ? { ...parsed.message, clientId: msg.clientId ?? streamingId }
                        : msg
                    ),
                  }));
                } else if (parsed.type === 'insights') {
                  insightsUpdatedDuringStream = true;
                  const insights = Array.isArray(parsed.insights) ? parsed.insights : [];
                  cancelInsightDetectionTimer();
                  setIsDetectingInsights(false);
                  setSessionData(prev => ({
                    ...prev,
                    insights,
                  }));
                } else if (parsed.type === 'step_completed') {
                  // Update conversation plan when a step is completed
                  if (parsed.conversationPlan) {
                    console.log('[handleStreamingResponse] 📋 Step completed, updating conversation plan');
                    setSessionData(prev => ({
                      ...prev,
                      conversationPlan: parsed.conversationPlan,
                    }));
                  }
                } else if (parsed.type === 'done') {
                  console.log('[handleStreamingResponse] ✅ Stream done, updating awaitingAiResponse state');
                  stopAwaitingAiResponse();
                  // Recharger les messages pour afficher le message persisté
                  if (sessionData.inviteToken) {
                    await loadSessionDataByToken(sessionData.inviteToken);
                  } else if (sessionData.askKey) {
                    await loadSessionData(sessionData.askKey);
                  }
                  if (insightsUpdatedDuringStream) {
                    cancelInsightDetectionTimer();
                    setIsDetectingInsights(false);
                  }
                  return insightsUpdatedDuringStream;
                } else if (parsed.type === 'error') {
                  console.error('Streaming error:', parsed.error);
                  stopAwaitingAiResponse();
                  return false;
                }
              } catch (error) {
                console.error('Error parsing streaming data:', error);
              }
            }
          }
        }
      }

      return insightsUpdatedDuringStream;
    } catch (error) {
      console.error('Streaming error:', error);
      stopAwaitingAiResponse();
      return false;
    }
  }, [
    sessionData.askKey,
    sessionData.ask?.askSessionId,
    sessionData.inviteToken,
    cancelInsightDetectionTimer,
    markMessagePosted,
    stopAwaitingAiResponse,
    loadSessionDataByToken,
    loadSessionData,
  ]);

  // Handle sending messages to database and schedule AI response
  const handleSendMessage = useCallback(async (
    content: string,
    type: Message['type'] = 'text',
    metadata?: Message['metadata']
  ) => {
    console.log('[handleSendMessage] 🚀 Attempting to send message:', {
      hasAskKey: !!sessionData.askKey,
      awaitingAiResponse,
      isDetectingInsights,
      isLoading: sessionData.isLoading
    });

    if (!sessionData.askKey) {
      console.log('[handleSendMessage] ❌ No askKey, aborting');
      return;
    }
    if (sessionData.isLoading) {
      console.log('[handleSendMessage] ⏸️ Already loading, aborting');
      return;
    }

    const timestamp = new Date().toISOString();
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const senderName = currentParticipantName || 'Vous';
    const optimisticMetadata = {
      ...(metadata ?? {}),
      senderName,
    } as Message['metadata'];

    const optimisticMessage: Message = {
      clientId: optimisticId,
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
      // First, save the user message
      const endpoint = isTestMode ? `/api/test/${sessionData.askKey}` : `/api/ask/${sessionData.askKey}`;

      // Include invite token in headers if available (for anonymous/invite-based access)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (sessionData.inviteToken) {
        headers['X-Invite-Token'] = sessionData.inviteToken;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
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

      // Update the optimistic message with the real one
      if (data.data?.message) {
        markMessagePosted();
        setSessionData(prev => ({
          ...prev,
          messages: prev.messages.map(message =>
            message.clientId === optimisticId
              ? { ...data.data!.message, clientId: message.clientId ?? optimisticId }
              : message
          ),
          isLoading: false,
        }));
      } else {
        setSessionData(prev => ({
          ...prev,
          isLoading: false,
        }));
      }

      // Now trigger the streaming AI response
      if (isTestMode) {
        stopAwaitingAiResponse();
        return;
      }

      console.log('[handleSendMessage] 🎬 Starting streaming response...');
      startAwaitingAiResponse();
      const insightsCapturedDuringStream = await handleStreamingResponse(content);
      console.log('[handleSendMessage] ✅ Streaming complete, insights captured:', insightsCapturedDuringStream);

      // Programmer la détection d'insights seulement si aucune donnée n'a été envoyée pendant le streaming
      if (!insightsCapturedDuringStream) {
        scheduleInsightDetection();
      }

    } catch (error) {
      console.error('Error sending message:', error);
      stopAwaitingAiResponse();
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        messages: prev.messages.filter(message => message.clientId !== optimisticId),
        error: parseErrorMessage(error)
      }));
    }
  }, [
    sessionData.askKey,
    sessionData.isLoading,
    sessionData.ask?.askSessionId,
    sessionData.inviteToken,
    awaitingAiResponse,
    isDetectingInsights,
    isTestMode,
    currentParticipantName,
    markMessagePosted,
    stopAwaitingAiResponse,
    startAwaitingAiResponse,
    handleStreamingResponse,
    scheduleInsightDetection,
  ]);

  // Handle editing a message (for correcting transcription errors)
  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!sessionData.askKey) {
      console.error('[handleEditMessage] ❌ No askKey, aborting');
      throw new Error('No ask key available');
    }

    console.log('[handleEditMessage] 📝 Editing message:', {
      messageId,
      newContentPreview: newContent.slice(0, 50) + '...',
      askKey: sessionData.askKey,
    });

    // Build the endpoint
    const endpoint = `/api/ask/${sessionData.askKey}/message/${messageId}`;

    // Include invite token in headers if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (sessionData.inviteToken) {
      headers['X-Invite-Token'] = sessionData.inviteToken;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          content: newContent,
          deleteSubsequent: true, // Delete all messages after this one
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to edit message');
      }

      console.log('[handleEditMessage] ✅ Message edited successfully:', {
        messageId: data.data?.message?.id,
        deletedCount: data.data?.deletedCount,
      });

      // Update local state: update the edited message and remove subsequent messages
      setSessionData(prev => {
        const messageIndex = prev.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) {
          console.warn('[handleEditMessage] Message not found in local state');
          return prev;
        }

        // Keep messages up to and including the edited one
        const messagesBeforeEdit = prev.messages.slice(0, messageIndex);
        const editedMessage = {
          ...prev.messages[messageIndex],
          content: newContent,
          metadata: {
            ...prev.messages[messageIndex].metadata,
            isEdited: true,
            editedAt: new Date().toISOString(),
          },
        };

        return {
          ...prev,
          messages: [...messagesBeforeEdit, editedMessage],
        };
      });

      // Trigger AI response for the edited message - but NOT in voice mode
      // In voice mode, the voice agent should handle the response naturally
      if (!isVoiceModeActive) {
        console.log('[handleEditMessage] 🤖 Triggering AI response for edited message (text mode)...');

        // Schedule streaming response just like handleSendMessage does
        setTimeout(async () => {
          try {
            await handleStreamingResponse(newContent);
          } catch (streamError) {
            console.error('[handleEditMessage] ❌ Error during streaming response:', streamError);
          }
        }, 100);
      } else {
        console.log('[handleEditMessage] 🎤 Voice mode active - skipping text streaming, voice agent will respond');
      }

    } catch (error) {
      console.error('[handleEditMessage] ❌ Error editing message:', error);
      throw error;
    }
  }, [sessionData.askKey, sessionData.inviteToken, handleStreamingResponse, isVoiceModeActive]);

  // Retry loading session data
  const retryLoad = () => {
    if (sessionData.inviteToken) {
      loadSessionDataByToken(sessionData.inviteToken);
    } else if (sessionData.askKey) {
      loadSessionData(sessionData.askKey);
    }
  };

  // Reload messages after voice mode closes
  const reloadMessagesAfterVoiceMode = useCallback(async () => {
    // Use a function that reads current state
    setSessionData(prev => {
      console.log('[HomePage] Reloading messages after voice mode close...', {
        hasInviteToken: !!prev.inviteToken,
        hasAskKey: !!prev.askKey,
        currentMessageCount: prev.messages.length
      });
      
      if (prev.inviteToken) {
        loadSessionDataByToken(prev.inviteToken).then(() => {
          console.log('[HomePage] ✅ Messages reloaded via token');
        }).catch(err => {
          console.error('[HomePage] ❌ Error reloading messages via token:', err);
        });
      } else if (prev.askKey) {
        loadSessionData(prev.askKey).then(() => {
          console.log('[HomePage] ✅ Messages reloaded via askKey');
        }).catch(err => {
          console.error('[HomePage] ❌ Error reloading messages via askKey:', err);
        });
      }
      return prev; // Don't modify state, just trigger reload
    });
  }, [loadSessionDataByToken, loadSessionData]);

  // Handle voice mode toggle (mémorisé pour éviter les re-renders de ChatComponent)
  const handleVoiceModeChange = useCallback((active: boolean) => {
    const wasActive = isVoiceModeActive;
    setIsVoiceModeActive(active);
    // Reload messages when voice mode is closed to ensure voice messages appear in text mode
    if (wasActive && !active) {
      console.log('[HomePage] 🎤 Voice mode closed, will reload messages in 1 second...', {
        currentMessageCount: sessionData.messages.length
      });
      setTimeout(() => {
        reloadMessagesAfterVoiceMode();
      }, 1000);
    }
  }, [isVoiceModeActive, sessionData.messages.length, reloadMessagesAfterVoiceMode]);

  // Handle insight content update
  const handleInsightUpdate = useCallback((insightId: string, newContent: string) => {
    setSessionData(prev => ({
      ...prev,
      insights: prev.insights.map(insight =>
        insight.id === insightId
          ? { ...insight, content: newContent, summary: null }
          : insight
      ),
    }));
  }, []);

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
    <div className="conversation-layout min-h-[100dvh] bg-gradient-to-br from-indigo-100 via-white to-indigo-200 overflow-x-hidden w-full max-w-full">
      {/* Beautiful Header - Compact on mobile */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm"
      >
        <div className="container mx-auto px-3 sm:px-6 py-1.5 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <motion.div
              className="flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <div className="w-7 h-7 sm:w-9 sm:h-9 bg-gradient-to-br from-pink-500 to-violet-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md">
                <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold sm:text-xl bg-gradient-to-r from-pink-500 to-violet-600 bg-clip-text text-transparent">
                  Insido.ai
                </h1>
                {isTestMode && (
                  <span className="test-mode-badge text-[10px]">TEST</span>
                )}
                {debugAuthId && !isMobile && (
                  <div className="mt-1 text-xs font-mono bg-yellow-100 px-2 py-1 rounded border border-yellow-300">
                    🔑 Auth ID: {debugAuthId}
                  </div>
                )}
              </div>
            </motion.div>
            <div className="flex items-center gap-2">
              {currentParticipantName && !isMobile && (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                  <span className="text-muted-foreground/80">Profil</span>
                  <span className="font-semibold text-foreground">{currentParticipantName}</span>
                </div>
              )}
              <UserProfileMenu />
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content with Beautiful Layout */}
      {isMobile ? (
        <MobileLayout
          sessionData={sessionData}
          currentParticipantName={currentParticipantName}
          awaitingAiResponse={awaitingAiResponse}
          voiceModeConfig={voiceModeConfig}
          isDetectingInsights={isDetectingInsights}
          onSendMessage={handleSendMessage}
          onVoiceMessage={handleVoiceMessage}
          setIsReplyBoxFocused={setIsReplyBoxFocused}
          setIsVoiceModeActive={setIsVoiceModeActive}
          isVoiceModeActive={isVoiceModeActive}
          reloadMessagesAfterVoiceMode={reloadMessagesAfterVoiceMode}
          onInitConversation={handleInitConversation}
          onEditMessage={handleEditMessage}
          mobileActivePanel={mobileActivePanel}
          setMobileActivePanel={setMobileActivePanel}
          isMobileHeaderExpanded={isMobileHeaderExpanded}
          setIsMobileHeaderExpanded={setIsMobileHeaderExpanded}
          askDetails={askDetails}
          sessionDataAskKey={sessionData.askKey}
          participants={participants}
          statusLabel={statusLabel}
          timelineLabel={timelineLabel}
          timeRemaining={timeRemaining}
          onInsightUpdate={handleInsightUpdate}
          sessionElapsedMinutes={sessionTimer.elapsedMinutes}
          isSessionTimerPaused={sessionTimer.isPaused}
          onUserTyping={sessionTimer.notifyUserTyping}
        />
      ) : (
        <main className="flex h-[calc(100dvh-88px)] overflow-hidden gap-6 p-6 min-w-0">
          {/* Chat Section - 1/3 of screen with glass effect */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="w-1/3 min-w-0"
          >
            <div className="chat-container h-full flex flex-col">
              {sessionData.conversationPlan && (
                <ConversationProgressBar
                  steps={sessionData.conversationPlan.plan_data.steps}
                  currentStepId={sessionData.conversationPlan.current_step_id}
                  elapsedMinutes={sessionTimer.elapsedMinutes}
                  isTimerPaused={sessionTimer.isPaused}
                />
              )}
              <div className="flex-1 overflow-hidden">
                <ChatComponent
                  key={`chat-mobile-${sessionData.askKey}`}
                  askKey={sessionData.askKey}
                  ask={sessionData.ask}
                  messages={sessionData.messages}
                  conversationPlan={sessionData.conversationPlan}
                  onSendMessage={handleSendMessage}
                  isLoading={sessionData.isLoading}
                  onHumanTyping={sessionTimer.notifyUserTyping}
                  currentParticipantName={currentParticipantName}
                  isMultiUser={Boolean(sessionData.ask && sessionData.ask.participants.length > 1)}
                  showAgentTyping={awaitingAiResponse && !isDetectingInsights}
                  voiceModeEnabled={!!voiceModeConfig?.systemPrompt}
                  voiceModeSystemPrompt={voiceModeConfig?.systemPrompt || undefined}
                  voiceModeUserPrompt={voiceModeConfig?.userPrompt || undefined}
                  voiceModePromptVariables={voiceModeConfig?.promptVariables || undefined}
                  voiceModeModelConfig={voiceModeConfig?.modelConfig || undefined}
                  onVoiceMessage={handleVoiceMessage}
                  onReplyBoxFocusChange={setIsReplyBoxFocused}
                  onInitConversation={handleInitConversation}
                  onVoiceModeChange={handleVoiceModeChange}
                  onEditMessage={handleEditMessage}
                />
              </div>
            </div>
          </motion.div>

          {/* Insight Section - 2/3 of screen with enhanced styling */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex-1 min-w-0"
          >
            <div className="h-full flex flex-col overflow-hidden gap-4">
              {/* Ask Details Card */}
              {askDetails && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0
                  }}
                  className="rounded-xl border border-white/50 bg-white/80 backdrop-blur px-4 shadow-sm transition-all duration-300"
                  style={{ 
                    paddingTop: "0.75rem",
                    paddingBottom: "0.75rem"
                  }}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1 sm:pr-4">
                        <h3 className="font-semibold tracking-tight text-xs sm:text-sm leading-snug text-foreground">
                          {askDetails.question}
                        </h3>
                        {askDetails.description && !isDetailsCollapsed && (
                          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                            {askDetails.description}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsDetailsCollapsed(prev => !prev)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-start"
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
                          className="overflow-hidden"
                        >
                          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">Session</p>
                              <div className="flex flex-wrap items-center gap-1">
                                {sessionData.askKey && (
                                  <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                                    Session:
                                    <span className="font-mono text-foreground ml-1">{sessionData.askKey}</span>
                                  </span>
                                )}
                                {sessionData.ask && (
                                  <span className={sessionData.ask.isActive ? 'session-active' : 'session-closed'}>
                                    {sessionData.ask.isActive ? 'Active' : 'Closed'}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">Statut</p>
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  {statusLabel}
                                </span>
                                {timeRemaining && (
                                  <span className="inline-flex items-center gap-1 text-primary text-[10px]">
                                    <Clock className="h-3 w-3" />
                                    <span>{timeRemaining}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">Cadre</p>
                              <div className="space-y-0.5 text-foreground">
                                <p className="font-medium text-[10px]">
                                  {getDeliveryModeLabel(askDetails.deliveryMode)}
                                </p>
                                <p className="text-muted-foreground text-[10px]">
                                  {getConversationModeDescription(askDetails.conversationMode)}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-1 sm:col-span-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                Participants ({participants.length})
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {participants.length > 0 ? (
                                  participants.map(participant => (
                                    <span
                                      key={participant.id}
                                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                                    >
                                      <span className="font-medium text-primary/90">{participant.name}</span>
                                      {participant.isSpokesperson && (
                                        <span className="text-[9px] uppercase tracking-wide text-primary/70">porte-parole</span>
                                      )}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">Aucun participant pour le moment</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {/* Insights Panel - with reduced height */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <InsightPanel
                  insights={sessionData.insights}
                  askKey={sessionData.askKey}
                  isDetectingInsights={isDetectingInsights}
                  onInsightUpdate={handleInsightUpdate}
                />
              </div>
            </div>
          </motion.div>
        </main>
      )}

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
