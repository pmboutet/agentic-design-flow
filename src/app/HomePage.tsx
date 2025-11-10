"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { AlertCircle, Clock, MessageSquare, Sparkles, ChevronDown, ChevronUp, MessageCircle, Lightbulb } from "lucide-react";
import { ChatComponent } from "@/components/chat/ChatComponent";
import { InsightPanel } from "@/components/insight/InsightPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionData, Ask, Message, Insight, Challenge, ApiResponse } from "@/types";
import {
  validateAskKey,
  parseErrorMessage,
  formatTimeRemaining,
  getAudienceDescription,
  getDeliveryModeLabel,
} from "@/lib/utils";
import { UserProfileMenu } from "@/components/auth/UserProfileMenu";
import { supabase } from "@/lib/supabaseClient";

type TokenSessionPayload = {
  ask: Ask;
  messages: Message[];
  insights: Insight[];
  challenges?: Challenge[];
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
  voiceModeSystemPrompt: string | null;
  voiceModeModelConfig: {
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
  } | null;
  isDetectingInsights: boolean;
  onSendMessage: (content: string, type?: Message['type'], metadata?: Message['metadata']) => void;
  onVoiceMessage: (role: 'user' | 'agent', content: string) => void;
  setIsReplyBoxFocused: (focused: boolean) => void;
  setIsVoiceModeActive: (active: boolean) => void;
  isVoiceModeActive: boolean;
  reloadMessagesAfterVoiceMode: () => void;
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
}

/**
 * Mobile layout component with collapsible header and swipeable panels
 */
function MobileLayout({
  sessionData,
  currentParticipantName,
  awaitingAiResponse,
  voiceModeSystemPrompt,
  voiceModeModelConfig,
  isDetectingInsights,
  onSendMessage,
  onVoiceMessage,
  setIsReplyBoxFocused,
  setIsVoiceModeActive,
  isVoiceModeActive,
  reloadMessagesAfterVoiceMode,
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
    <div className="flex flex-col h-[calc(100vh-88px)] overflow-hidden">
      {/* Collapsible Header */}
      {askDetails && (
        <motion.div
          initial={false}
          animate={{
            height: isMobileHeaderExpanded ? 'auto' : '60px',
          }}
          className="overflow-hidden border-b border-white/50 bg-white/80 backdrop-blur"
        >
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="font-semibold text-sm leading-tight text-foreground truncate">
                  {askDetails.question}
                </h3>
                {askDetails.description && !isMobileHeaderExpanded && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {askDetails.description}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileHeaderExpanded(!isMobileHeaderExpanded)}
                className="flex-shrink-0"
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
      <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        <motion.div
          drag="x"
          dragConstraints={panelWidth > 0 ? { left: -panelWidth, right: 0 } : { left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          style={{ x }}
          className="flex h-full"
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
            className="w-full flex-shrink-0 h-full"
            animate={{
              opacity: mobileActivePanel === 'chat' ? 1 : 0.5,
            }}
            transition={{ duration: 0.2 }}
          >
            <div className="h-full p-2 md:p-4 overflow-y-auto">
              <ChatComponent
                askKey={sessionDataAskKey}
                ask={sessionData.ask}
                messages={sessionData.messages}
                onSendMessage={onSendMessage}
                isLoading={sessionData.isLoading}
                currentParticipantName={currentParticipantName}
                isMultiUser={Boolean(sessionData.ask && sessionData.ask.participants.length > 1)}
                showAgentTyping={awaitingAiResponse}
                voiceModeEnabled={!!voiceModeSystemPrompt}
                voiceModeSystemPrompt={voiceModeSystemPrompt || undefined}
                voiceModeModelConfig={voiceModeModelConfig || undefined}
                onVoiceMessage={onVoiceMessage}
                onReplyBoxFocusChange={setIsReplyBoxFocused}
                onVoiceModeChange={(active) => {
                  const wasActive = isVoiceModeActive;
                  setIsVoiceModeActive(active);
                  if (wasActive && !active) {
                    setTimeout(() => {
                      reloadMessagesAfterVoiceMode();
                    }, 1000);
                  }
                }}
              />
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
              />
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Panel Indicator */}
      <div className="flex items-center justify-center gap-2 py-3 bg-white/50 backdrop-blur border-t border-white/50">
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
    isLoading: false,
    error: null
  });
  const responseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const insightDetectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasPostedMessageSinceRefreshRef = useRef(false);
  const [awaitingAiResponse, setAwaitingAiResponse] = useState(false);
  const [isDetectingInsights, setIsDetectingInsights] = useState(false);
  const participantFromUrl = searchParams.get('participant') || searchParams.get('participantName');
  const derivedParticipantName = participantFromUrl?.trim() ? participantFromUrl.trim() : null;
  const [currentParticipantName, setCurrentParticipantName] = useState<string | null>(derivedParticipantName);
  const isTestMode = searchParams.get('mode') === 'test';
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);
  const [isReplyBoxFocused, setIsReplyBoxFocused] = useState(false);
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const autoCollapseTriggeredRef = useRef(false);
  const previousMessageCountRef = useRef(0);
  // Mobile view states
  const [mobileActivePanel, setMobileActivePanel] = useState<'chat' | 'insights'>('chat');
  const [isMobileHeaderExpanded, setIsMobileHeaderExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // DEBUG: Afficher auth ID temporairement
  const [debugAuthId, setDebugAuthId] = useState<string | null>(null);
  // Voice mode configuration
  const [voiceModeSystemPrompt, setVoiceModeSystemPrompt] = useState<string | null>(null);
  const [voiceModeModelConfig, setVoiceModeModelConfig] = useState<{
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
  } | null>(null);
  // Store logId for voice agent exchanges (user message -> agent response)
  const voiceAgentLogIdRef = useRef<string | null>(null);
  const inviteTokenRef = useRef<string | null>(null);
  
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
    }
  }, [cancelResponseTimer, sessionData.ask?.askSessionId, sessionData.askKey, sessionData.inviteToken, isTestMode]);

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
    setIsDetectingInsights(true);
    insightDetectionTimerRef.current = setTimeout(() => {
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

  // Handle sending messages to database and schedule AI response
  const handleSendMessage = async (
    content: string,
    type: Message['type'] = 'text',
    metadata?: Message['metadata']
  ) => {
    if (!sessionData.askKey) return;

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
        setAwaitingAiResponse(false);
        return;
      }

      setAwaitingAiResponse(true);
      const insightsCapturedDuringStream = await handleStreamingResponse();
      
      // Programmer la détection d'insights seulement si aucune donnée n'a été envoyée pendant le streaming
      if (!insightsCapturedDuringStream) {
        scheduleInsightDetection();
      }

    } catch (error) {
      console.error('Error sending message:', error);
      setAwaitingAiResponse(false);
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        messages: prev.messages.filter(message => message.clientId !== optimisticId),
        error: parseErrorMessage(error)
      }));
    }
  };

  // Handle voice mode messages
  const handleVoiceMessage = useCallback(async (
    role: 'user' | 'agent',
    content: string
  ) => {
    if (!sessionData.askKey || !content.trim()) return;

    const timestamp = new Date().toISOString();
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    if (role === 'user') {
      // Create user message from transcribed speech (without triggering text streaming)
      const senderName = currentParticipantName || 'Vous';
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
        },
      };

      setSessionData(prev => ({
        ...prev,
        messages: [...prev.messages, optimisticMessage],
      }));

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
          console.log('[HomePage] ⚠️ No invite token available, will use regular auth');
        }

        const endpoint = isTestMode ? `/api/test/${sessionData.askKey}` : `/api/ask/${sessionData.askKey}`;
        console.log('[HomePage] 📤 Persisting voice user message:', {
          endpoint,
          hasInviteToken: !!inviteTokenRef.current,
          content: content.substring(0, 50)
        });
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content,
            type: 'text',
            metadata: { voiceTranscribed: true },
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
    if (!sessionData.ask?.askSessionId) return;

    try {
      const response = await fetch(`/api/ask/${sessionData.askKey}/agent-config`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setVoiceModeSystemPrompt(data.data.systemPrompt || null);
          // Extract voice agent config from model config if available
          // These fields are now stored directly in the database columns
          if (data.data.modelConfig) {
            const modelConfig = data.data.modelConfig;
            console.log('[HomePage] 🎤 Loading voice mode config:', {
              provider: modelConfig.provider,
              voiceAgentProvider: modelConfig.voiceAgentProvider,
              speechmaticsLlmModel: modelConfig.speechmaticsLlmModel,
              speechmaticsLlmProvider: modelConfig.speechmaticsLlmProvider,
            });
            setVoiceModeModelConfig({
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
            });
          } else {
            // Use default config when no model config is available
            setVoiceModeModelConfig({
              deepgramSttModel: 'nova-3',
              deepgramTtsModel: 'aura-2-thalia-en',
              deepgramLlmProvider: 'anthropic',
              deepgramLlmModel: undefined, // No fallback - must be configured in database
            });
          }
        }
      }
    } catch (error) {
      console.error('Error loading voice mode config:', error);
    }
  }, [sessionData.askKey, sessionData.ask?.askSessionId]);

  // Load voice mode config when session loads
  useEffect(() => {
    if (sessionData.ask?.askSessionId) {
      loadVoiceModeConfig();
    }
  }, [sessionData.ask?.askSessionId, loadVoiceModeConfig]);

  // Handle streaming AI response
  const handleStreamingResponse = async (): Promise<boolean> => {
    if (!sessionData.askKey || awaitingAiResponse) return false;

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

      const response = await fetch(`/api/ask/${currentAskKey}/stream`, {
        method: 'POST',
        headers: streamHeaders,
        body: JSON.stringify({
          message: sessionData.messages[sessionData.messages.length - 1]?.content || '',
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
                } else if (parsed.type === 'done') {
                  setAwaitingAiResponse(false);
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
                  setAwaitingAiResponse(false);
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
      setAwaitingAiResponse(false);
      return false;
    }
  };

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
        <div className="container mx-auto px-4 sm:px-6 py-3 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
                {debugAuthId && (
                  <div className="mt-1 text-xs font-mono bg-yellow-100 px-2 py-1 rounded border border-yellow-300">
                    🔑 Auth ID: {debugAuthId}
                  </div>
                )}
              </div>
            </motion.div>
            <div className="flex flex-col items-end gap-2">
              {currentParticipantName && (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                  <span className="text-muted-foreground/80">Profil</span>
                  <span className="font-semibold text-foreground">{currentParticipantName}</span>
                </div>
              )}
              <UserProfileMenu />
            </div>
          </div>
          {askDetails && !isMobile && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ 
                opacity: 1, 
                y: 0
              }}
              className="w-full rounded-xl border border-white/50 bg-white/80 backdrop-blur px-4 shadow-sm transition-all duration-300"
              style={{ 
                paddingTop: (isReplyBoxFocused || isVoiceModeActive) ? "0.75rem" : "1rem",
                paddingBottom: (isReplyBoxFocused || isVoiceModeActive) ? "0.75rem" : "1rem"
              }}
            >
              <div className="flex flex-col" style={{ gap: (isReplyBoxFocused || isVoiceModeActive) ? "0.5rem" : "0.75rem" }}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 sm:pr-4">
                    <h3 className="font-semibold tracking-tight text-xs sm:text-sm leading-snug text-foreground">
                      {askDetails.question}
                    </h3>
                    {askDetails.description && !isDetailsCollapsed && !isReplyBoxFocused && !isVoiceModeActive && (
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        {askDetails.description}
                      </p>
                    )}
                  </div>
                  {!isReplyBoxFocused && !isVoiceModeActive && (
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
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {!isDetailsCollapsed && !isReplyBoxFocused && !isVoiceModeActive && (
                    <motion.div
                      key="ask-details"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-3 overflow-hidden"
                    >
                      <div className="grid gap-3 sm:gap-4 text-sm text-muted-foreground sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Session</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {sessionData.askKey && (
                              <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
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
              </div>
            </motion.div>
          )}
        </div>
      </motion.header>

      {/* Main Content with Beautiful Layout */}
      {isMobile ? (
        <MobileLayout
          sessionData={sessionData}
          currentParticipantName={currentParticipantName}
          awaitingAiResponse={awaitingAiResponse}
          voiceModeSystemPrompt={voiceModeSystemPrompt}
          voiceModeModelConfig={voiceModeModelConfig}
          isDetectingInsights={isDetectingInsights}
          onSendMessage={handleSendMessage}
          onVoiceMessage={handleVoiceMessage}
          setIsReplyBoxFocused={setIsReplyBoxFocused}
          setIsVoiceModeActive={setIsVoiceModeActive}
          isVoiceModeActive={isVoiceModeActive}
          reloadMessagesAfterVoiceMode={reloadMessagesAfterVoiceMode}
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
        />
      ) : (
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
                currentParticipantName={currentParticipantName}
                isMultiUser={Boolean(sessionData.ask && sessionData.ask.participants.length > 1)}
                showAgentTyping={awaitingAiResponse}
                voiceModeEnabled={!!voiceModeSystemPrompt}
                voiceModeSystemPrompt={voiceModeSystemPrompt || undefined}
                voiceModeModelConfig={voiceModeModelConfig || undefined}
                onVoiceMessage={handleVoiceMessage}
                onReplyBoxFocusChange={setIsReplyBoxFocused}
                onVoiceModeChange={(active) => {
                  const wasActive = isVoiceModeActive;
                  setIsVoiceModeActive(active);
                  // Reload messages when voice mode is closed to ensure voice messages appear in text mode
                  if (wasActive && !active) {
                    console.log('[HomePage] 🎤 Voice mode closed, will reload messages in 1 second...', {
                      currentMessageCount: sessionData.messages.length,
                      hasInviteToken: !!sessionData.inviteToken,
                      hasAskKey: !!sessionData.askKey
                    });
                    // Longer delay to ensure voice messages are fully persisted
                    setTimeout(() => {
                      reloadMessagesAfterVoiceMode();
                    }, 1000);
                  }
                }}
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
                isDetectingInsights={isDetectingInsights}
              />
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
