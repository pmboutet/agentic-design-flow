"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MicOff, Volume2, VolumeX, Pencil, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeepgramVoiceAgent, DeepgramMessageEvent } from '@/lib/ai/deepgram';
import { HybridVoiceAgent, HybridVoiceAgentMessage } from '@/lib/ai/hybrid-voice-agent';
import { SpeechmaticsVoiceAgent, SpeechmaticsMessageEvent } from '@/lib/ai/speechmatics';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';

interface PremiumVoiceInterfaceProps {
  askKey: string;
  askSessionId?: string;
  systemPrompt: string;
  userPrompt?: string; // User prompt template (same as text mode)
  modelConfig?: {
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
    disableElevenLabsTTS?: boolean;
  };
  onMessage: (message: DeepgramMessageEvent | HybridVoiceAgentMessage | SpeechmaticsMessageEvent) => void;
  onError: (error: Error) => void;
  onClose: () => void;
  onEdit?: () => void;
  messages?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
    messageId?: string; // Added to support stable keys throughout lifecycle
    metadata?: Record<string, unknown>; // Preserve metadata to access messageId
  }>;
}

type VoiceMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  messageId?: string;
  isInterim?: boolean;
};

export function PremiumVoiceInterface({
  askKey,
  askSessionId,
  systemPrompt,
  userPrompt,
  modelConfig,
  onMessage,
  onError,
  onClose,
  onEdit,
  messages = [],
}: PremiumVoiceInterfaceProps) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Microphone controls state
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string | null>(null);
  const [microphoneSensitivity, setMicrophoneSensitivity] = useState<number>(1.5);
  const [voiceIsolationEnabled, setVoiceIsolationEnabled] = useState<boolean>(true);
  const [availableMicrophones, setAvailableMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [showMicrophoneSettings, setShowMicrophoneSettings] = useState<boolean>(false);

  // NEW: Optimistic message cache for real-time updates
  // This replaces the complex voiceMessages state system
  const [optimisticCache, setOptimisticCache] = useState<Map<string, VoiceMessage>>(new Map());

  const agentRef = useRef<DeepgramVoiceAgent | HybridVoiceAgent | SpeechmaticsVoiceAgent | null>(null);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isDisconnectingRef = useRef<boolean>(false);
  const isConnectingRef = useRef<boolean>(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousOptimisticCountRef = useRef<number>(0);
  const previousPropsCountRef = useRef<number>(0);
  const isHybridAgent = modelConfig?.provider === "hybrid-voice-agent";
  // Use voiceAgentProvider if available, otherwise fallback to provider
  // But warn if provider is not a voice agent (e.g., "anthropic", "openai")
  const voiceAgentProvider = modelConfig?.voiceAgentProvider || modelConfig?.provider;
  const isSpeechmaticsAgent = voiceAgentProvider === "speechmatics-voice-agent";
  
  // Warn if we're using a non-voice-agent provider as fallback
  const validVoiceAgents = ["deepgram-voice-agent", "hybrid-voice-agent", "speechmatics-voice-agent"];
  if (!modelConfig?.voiceAgentProvider && modelConfig?.provider && 
      !validVoiceAgents.includes(modelConfig.provider)) {
    console.warn('[PremiumVoiceInterface] ⚠️ Using non-voice-agent provider as fallback:', {
      provider: modelConfig.provider,
      voiceAgentProvider: modelConfig.voiceAgentProvider,
      message: 'This is likely a configuration error. voice_agent_provider should be set in the database.',
    });
  }
  const isMutedRef = useRef(isMuted);

  const voiceAgentLogData = useMemo(() => {
    const promptVariables = (modelConfig as any)?.promptVariables;
    const promptVariableKeys = promptVariables ? Object.keys(promptVariables).sort() : null;
    const modelConfigKeys = modelConfig ? Object.keys(modelConfig).sort() : [];
    
    const payload = {
      provider: modelConfig?.provider,
      voiceAgentProvider,
      effectiveProvider: voiceAgentProvider,
      isSpeechmaticsAgent,
      isHybridAgent,
      modelConfigKeys,
      speechmaticsSttLanguage: modelConfig?.speechmaticsSttLanguage,
      promptVariables: promptVariableKeys,
    };
    
    return {
      payload,
      signature: JSON.stringify(payload),
    };
  }, [modelConfig, voiceAgentProvider, isSpeechmaticsAgent, isHybridAgent]);

  // Message registry for deduplication at source
  const messageRegistry = useRef<Map<string, { content: string; status: 'interim' | 'final'; timestamp: number }>>(new Map());
  
  // Debug log
  useEffect(() => {
    console.log('[PremiumVoiceInterface] 🎤 Voice Agent Selection:', voiceAgentLogData.payload);
    
    if (!isSpeechmaticsAgent) {
      console.warn('[PremiumVoiceInterface] ⚠️ Speechmatics not selected!', {
        voiceAgentProvider,
        provider: modelConfig?.provider,
        expected: 'speechmatics-voice-agent',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceAgentLogData.signature]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  /**
   * NEW SIMPLIFIED MESSAGE SYSTEM
   * Updates optimistic cache with deduplication at source
   */
  const mergeStreamingContent = useCallback((previous: string | undefined, incoming: string): string => {
    if (!previous) return incoming;
    if (!incoming) return previous;
    if (incoming === previous) return previous;
    if (incoming.startsWith(previous)) return incoming;
    if (previous.startsWith(incoming)) return previous;
    if (incoming.includes(previous)) return incoming;
    if (previous.includes(incoming)) return previous;
    return `${previous} ${incoming}`.replace(/\s+/g, ' ').trim();
  }, []);

  const updateOptimisticMessage = useCallback((message: SpeechmaticsMessageEvent) => {
    if (!message.messageId) {
      console.log('[PremiumVoice] ⚠️ Message without messageId, skipping:', {
        role: message.role,
        content: message.content.substring(0, 30) + '...',
        isInterim: message.isInterim,
      });
      return;
    }

    const id = message.messageId;
    const existing = messageRegistry.current.get(id);
    const now = Date.now();

    // If we receive a final message, it should replace any interim message with the same ID
    if (!message.isInterim) {
      
      // Final message - always update/replace
      messageRegistry.current.set(id, {
        content: message.content, // Store complete content
        status: 'final',
        timestamp: now,
      });

      // Update optimistic cache - this replaces the interim message
      setOptimisticCache(prev => {
        const next = new Map(prev);
        const hadInterim = prev.has(id);
        const oldContent = prev.get(id)?.content;
        next.set(id, {
          role: message.role === 'agent' ? 'assistant' : message.role,
          content: message.content, // Use complete content from message
          timestamp: message.timestamp || new Date().toISOString(),
          messageId: id,
          isInterim: false,
        });
        return next;
      });
      return;
    }

    // For interim messages:
    // Skip if we already have final version (final takes precedence)
    if (existing?.status === 'final') {
      return; // Don't overwrite final with interim
    }

    // Skip if interim and content unchanged
    if (existing?.content === message.content) {
      return; // No change, skip
    }

    // Update registry for interim message
    messageRegistry.current.set(id, {
      content: message.content,
      status: 'interim',
      timestamp: now,
    });

    // Clean up old entries (> 30 seconds)
    const cutoff = now - 30000;
    for (const [key, value] of messageRegistry.current) {
      if (value.timestamp < cutoff) {
        messageRegistry.current.delete(key);
      }
    }

    // Update optimistic cache
    setOptimisticCache(prev => {
      const next = new Map(prev);
      const previousMessage = next.get(id);
      const previousContent = previousMessage?.content || existing?.content;
      const mergedContent = mergeStreamingContent(previousContent, message.content);
      next.set(id, {
        role: message.role === 'agent' ? 'assistant' : message.role,
        content: mergedContent,
        timestamp: message.timestamp || previousMessage?.timestamp || new Date().toISOString(),
        messageId: id,
        isInterim: true,
      });
      return next;
    });
  }, [mergeStreamingContent]);

  // Get user name for greeting
  const getUserName = () => {
    if (user?.fullName) {
      const firstName = user.fullName.split(' ')[0];
      return firstName;
    }
    return 'there';
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Setup audio analysis
  const setupAudioAnalysis = useCallback(async (stream: MediaStream) => {
    try {
      if (isMutedRef.current) {
        console.log('[PremiumVoiceInterface] 🔇 Skipping audio analysis setup because microphone is muted');
        stream.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
        return;
      }

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      microphone.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      microphoneNodeRef.current = microphone;
      streamRef.current = stream;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastLevel = 0;

      const updateAudioLevel = () => {
        // Stop if analyser was cleaned up (component unmounted or muted)
        if (!analyserRef.current) {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalizedLevel = Math.min(average / 128, 1);

        // Only update if level changed significantly (reduce re-renders)
        if (Math.abs(normalizedLevel - lastLevel) > 0.01) {
          lastLevel = normalizedLevel;
          setAudioLevel(normalizedLevel);
        }

        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };

      updateAudioLevel();
    } catch (err) {
      console.error('Error setting up audio analysis:', err);
    }
  }, []);

  const startAudioVisualization = useCallback(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        if (isMutedRef.current) {
          stream.getTracks().forEach(track => {
            if (track.readyState === 'live') {
              track.stop();
            }
          });
          return;
        }
        return setupAudioAnalysis(stream);
      })
      .catch(err => {
        console.warn('[PremiumVoiceInterface] Could not setup audio analysis:', err);
      });
  }, [setupAudioAnalysis]);

  // Load available microphone devices
  const loadMicrophoneDevices = useCallback(async () => {
    try {
      // Request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter(device => device.kind === 'audioinput');
      
      setAvailableMicrophones(microphones);
      
      // Load saved preferences from localStorage
      const savedDeviceId = localStorage.getItem('voiceAgent_microphoneDeviceId');
      const savedSensitivity = localStorage.getItem('voiceAgent_microphoneSensitivity');
      const savedIsolation = localStorage.getItem('voiceAgent_voiceIsolation');
      
      if (savedDeviceId && microphones.some(m => m.deviceId === savedDeviceId)) {
        setSelectedMicrophoneId(savedDeviceId);
      } else if (microphones.length > 0) {
        setSelectedMicrophoneId(microphones[0].deviceId);
      }
      
      if (savedSensitivity) {
        const sensitivity = parseFloat(savedSensitivity);
        if (!isNaN(sensitivity) && sensitivity >= 0.5 && sensitivity <= 3.0) {
          setMicrophoneSensitivity(sensitivity);
        }
      }
      
      if (savedIsolation !== null) {
        setVoiceIsolationEnabled(savedIsolation === 'true');
      }
    } catch (error) {
      console.error('[PremiumVoiceInterface] Error loading microphone devices:', error);
    }
  }, []);

  // Save preferences to localStorage
  const savePreferences = useCallback(() => {
    if (selectedMicrophoneId) {
      localStorage.setItem('voiceAgent_microphoneDeviceId', selectedMicrophoneId);
    }
    localStorage.setItem('voiceAgent_microphoneSensitivity', microphoneSensitivity.toString());
    localStorage.setItem('voiceAgent_voiceIsolation', voiceIsolationEnabled.toString());
  }, [selectedMicrophoneId, microphoneSensitivity, voiceIsolationEnabled]);

  // Cleanup audio analysis
  // When muting, we keep the audio context open for TTS playback
  // When disconnecting, we close everything including the audio context
  const cleanupAudioAnalysis = useCallback((closeAudioContext: boolean = false) => {
    console.log('[PremiumVoiceInterface] 🧹 Cleaning up audio analysis...', { closeAudioContext });
    
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // CRITICAL: Disconnect ALL AudioNodes before closing AudioContext
    // This ensures no audio graph connections remain active
    
    // Disconnect microphone node (MediaStreamAudioSourceNode)
    if (microphoneNodeRef.current) {
      try {
        microphoneNodeRef.current.disconnect();
        microphoneNodeRef.current = null;
        console.log('[PremiumVoiceInterface] ✅ Microphone node disconnected');
      } catch (error) {
        console.warn('[PremiumVoiceInterface] ⚠️ Error disconnecting microphone node:', error);
      }
    }
    
    // Disconnect analyser node
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
        analyserRef.current = null;
        console.log('[PremiumVoiceInterface] ✅ Analyser node disconnected');
      } catch (error) {
        console.warn('[PremiumVoiceInterface] ⚠️ Error disconnecting analyser node:', error);
      }
    }
    
    // Stop all media stream tracks (microphone input)
    // CRITICAL: Stop ALL tracks (audio + video if present) to fully release the microphone
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
            console.log('[PremiumVoiceInterface] ✅ Stopped track:', track.kind, track.label);
          }
        });
        streamRef.current = null;
        console.log('[PremiumVoiceInterface] ✅ Media stream cleaned up');
      } catch (error) {
        console.warn('[PremiumVoiceInterface] ⚠️ Error stopping stream tracks:', error);
      }
    }
    
    // Only close audio context if explicitly requested (full disconnect)
    // When muting, we keep it open for TTS playback
    // CRITICAL: Close AudioContext AFTER all nodes are disconnected
    if (closeAudioContext && audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
        console.log('[PremiumVoiceInterface] ✅ Audio context closed');
      } catch (error) {
        console.warn('[PremiumVoiceInterface] ⚠️ Error closing audio context:', error);
      }
      audioContextRef.current = null;
    } else if (closeAudioContext === false) {
      console.log('[PremiumVoiceInterface] ℹ️ Audio context kept open for TTS playback');
    }
    
    setAudioLevel(0);
    console.log('[PremiumVoiceInterface] ✅ Audio analysis cleanup complete');
  }, []);

  const handleMessage = useCallback((message: DeepgramMessageEvent | HybridVoiceAgentMessage | SpeechmaticsMessageEvent) => {
    const isInterim = Boolean(message.isInterim);
    const messageId = (message as SpeechmaticsMessageEvent).messageId;

    // Detect when user is speaking
    if (message.role === 'user') {
      setIsSpeaking(true);
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
      speakingTimeoutRef.current = setTimeout(() => {
        setIsSpeaking(false);
      }, 2000);
    }
    
    // Update optimistic cache for real-time display
    // This handles interim messages and their transition to final
    if (messageId) {
      updateOptimisticMessage({
        ...(message as SpeechmaticsMessageEvent),
        isInterim,
        messageId,
      });
    }

    // Always call parent callback with preserved messageId
    // This ensures the message is persisted and appears in props.messages
    const finalMessageId = messageId || `msg-${Date.now()}`;
    
    onMessage({
      ...message,
      messageId: finalMessageId, // Ensure stable ID
    });
  }, [onMessage, updateOptimisticMessage]);

  const handleError = useCallback((error: Error) => {
    setError(error.message);
    onError(error);
  }, [onError]);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
    if (!connected && agentRef.current) {
      setIsMicrophoneActive(false);
      setIsSpeaking(false);
      cleanupAudioAnalysis(true); // Close audio context on disconnect
    }
  }, [cleanupAudioAnalysis]);

  const connect = useCallback(async () => {
    // CRITICAL: Prevent multiple simultaneous connections
    if (isConnectingRef.current) {
      console.warn('[PremiumVoiceInterface] ⚠️ Connection already in progress, ignoring duplicate call');
      return;
    }

    // CRITICAL: Wait for any ongoing disconnect to complete before connecting
    if (isDisconnectingRef.current) {
      console.log('[PremiumVoiceInterface] ⏳ Waiting for previous disconnect to complete...');
      // Wait up to 5 seconds for disconnect to complete
      let waitCount = 0;
      while (isDisconnectingRef.current && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      if (isDisconnectingRef.current) {
        console.warn('[PremiumVoiceInterface] ⚠️ Previous disconnect still in progress after 5s, aborting new connection');
        setError('Previous disconnect still in progress. Please wait a moment and try again.');
        return;
      }
    }

    // Check if already connected
    if (agentRef.current && isConnected) {
      console.log('[PremiumVoiceInterface] ℹ️ Already connected, skipping new connection');
      return;
    }

    try {
      isConnectingRef.current = true;
      console.log('[PremiumVoiceInterface] 🔌 Starting connection...');
      setError(null);
      setIsConnecting(true);

      if (isHybridAgent) {
        const agent = new HybridVoiceAgent();
        agentRef.current = agent;

        agent.setCallbacks({
          onMessage: handleMessage,
          onError: handleError,
          onConnection: handleConnectionChange,
        });

        const config: any = {
          systemPrompt,
          sttModel: modelConfig?.deepgramSttModel || "nova-3",
          llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
          llmModel: modelConfig?.deepgramLlmModel,
          elevenLabsVoiceId: modelConfig?.elevenLabsVoiceId,
          elevenLabsModelId: modelConfig?.elevenLabsModelId || "eleven_turbo_v2_5",
        };

        await agent.connect(config);
        await agent.startMicrophone(selectedMicrophoneId || undefined, voiceIsolationEnabled);
        
        // Setup audio analysis after microphone is started
        // We'll create a separate stream for visualization
        startAudioVisualization();
      } else if (isSpeechmaticsAgent) {
        const agent = new SpeechmaticsVoiceAgent();
        agentRef.current = agent;

        agent.setCallbacks({
          onMessage: handleMessage,
          onError: handleError,
          onConnection: handleConnectionChange,
        });

        const config: any = {
          systemPrompt,
          userPrompt,
          promptVariables: (modelConfig as any)?.promptVariables, // Pass prompt variables for template rendering
          sttLanguage: modelConfig?.speechmaticsSttLanguage || "fr",
          sttOperatingPoint: modelConfig?.speechmaticsSttOperatingPoint || "enhanced",
          sttMaxDelay: modelConfig?.speechmaticsSttMaxDelay || 2.0,
          sttEnablePartials: modelConfig?.speechmaticsSttEnablePartials !== false,
          llmProvider: (modelConfig?.speechmaticsLlmProvider as "anthropic" | "openai") || "anthropic",
          llmModel: modelConfig?.speechmaticsLlmModel,
          elevenLabsVoiceId: modelConfig?.elevenLabsVoiceId,
          elevenLabsModelId: modelConfig?.elevenLabsModelId || "eleven_turbo_v2_5",
          disableElevenLabsTTS: modelConfig?.disableElevenLabsTTS || false,
          microphoneSensitivity,
          microphoneDeviceId: selectedMicrophoneId || undefined,
          voiceIsolation: voiceIsolationEnabled,
        };

        await agent.connect(config);
        await agent.startMicrophone(selectedMicrophoneId || undefined, voiceIsolationEnabled);
        
        // Setup audio analysis after microphone is started
        // We'll create a separate stream for visualization
        startAudioVisualization();
      } else {
        const agent = new DeepgramVoiceAgent();
        agentRef.current = agent;

        agent.setCallbacks({
          onMessage: handleMessage,
          onError: handleError,
          onConnection: handleConnectionChange,
        });

        const config: any = {
          systemPrompt,
          sttModel: modelConfig?.deepgramSttModel || "nova-3",
          ttsModel: modelConfig?.deepgramTtsModel || "aura-2-thalia-en",
          llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
          llmModel: modelConfig?.deepgramLlmModel,
        };

        await agent.connect(config);
        await agent.startMicrophone(selectedMicrophoneId || undefined, voiceIsolationEnabled);
        
        // Setup audio analysis after microphone is started
        // We'll create a separate stream for visualization
        startAudioVisualization();
      }

      setIsMicrophoneActive(true);
      setIsConnecting(false);
      isConnectingRef.current = false;
    } catch (err) {
      console.error('[PremiumVoiceInterface] ❌ Connection error:', err);
      setIsConnecting(false);
      isConnectingRef.current = false;
      cleanupAudioAnalysis(true); // Close audio context on connection error
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to voice agent';
      setError(errorMessage);
      handleError(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [systemPrompt, modelConfig, isHybridAgent, isSpeechmaticsAgent, isConnected, handleMessage, handleError, handleConnectionChange, setupAudioAnalysis, cleanupAudioAnalysis, startAudioVisualization]);

  const disconnect = useCallback(async () => {
    // CRITICAL: Prevent multiple simultaneous disconnects
    if (isDisconnectingRef.current) {
      console.warn('[PremiumVoiceInterface] ⚠️ Disconnect already in progress, ignoring duplicate call');
      return;
    }

    isDisconnectingRef.current = true;
    console.log('[PremiumVoiceInterface] 🔌 Disconnecting completely...');
    
    try {
      // Clear timeout first
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
        speakingTimeoutRef.current = null;
      }
      
      // Cleanup audio analysis FIRST (stops the separate stream for visualization)
      // This ensures the visualization stream is stopped before the agent stream
      cleanupAudioAnalysis(true); // Close audio context on disconnect
      
      // Disconnect agent (this will stop the agent's microphone stream AND websocket)
      // CRITICAL: Wait for agent disconnect to complete to ensure all resources are released
      if (agentRef.current) {
        try {
          // This will:
          // - Stop microphone
          // - Disconnect websocket
          // - Clear all queues
          // - Stop audio playback
          // - Call enumerateDevices() to force browser cleanup
          await agentRef.current.disconnect();
          console.log('[PremiumVoiceInterface] ✅ Agent disconnected (microphone + websocket)');
        } catch (error) {
          console.warn('[PremiumVoiceInterface] Error disconnecting agent:', error);
        }
        agentRef.current = null;
      }
      
      // CRITICAL: Additional delay to ensure browser has time to release all microphone resources
      // This helps prevent the red microphone indicator from staying active
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Reset all state
      setIsConnected(false);
      setIsMicrophoneActive(false);
      setIsMuted(false);
      setIsSpeaking(false);
      setError(null);

      // Clear optimistic cache and message registry
      setOptimisticCache(new Map());
      messageRegistry.current.clear();
      
      console.log('[PremiumVoiceInterface] ✅ Complete disconnection finished - websocket and microphone are OFF');
    } finally {
      // Always reset the disconnecting flag, even if there was an error
      isDisconnectingRef.current = false;
    }
  }, [cleanupAudioAnalysis]);

  const toggleMute = useCallback(async () => {
    const agent = agentRef.current;
    if (!agent) {
      return;
    }

    if (isMuted) {
      // User wants to unmute - need to reconnect WebSocket and restart microphone
      console.log('[PremiumVoiceInterface] 🔊 Unmuting - reconnecting WebSocket and restarting microphone...');
      isMutedRef.current = false;
      setIsMuted(false);
      setIsConnecting(true);

      try {
        // Reconnect WebSocket first (since stopMicrophone() closed it)
        if (agent instanceof SpeechmaticsVoiceAgent) {
          agent.setMicrophoneMuted(false);
          setIsMicrophoneActive(true);
          setIsConnecting(false);
          startAudioVisualization();
          console.log('[PremiumVoiceInterface] ✅ Speechmatics unmuted - stream resumed');
          return;
        } else if (isHybridAgent && agent instanceof HybridVoiceAgent) {
          const config: any = {
            systemPrompt,
            sttModel: modelConfig?.deepgramSttModel || "nova-3",
            llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
            llmModel: modelConfig?.deepgramLlmModel,
            elevenLabsVoiceId: modelConfig?.elevenLabsVoiceId,
            elevenLabsModelId: modelConfig?.elevenLabsModelId || "eleven_turbo_v2_5",
          };
          await agent.connect(config);
          await agent.startMicrophone(selectedMicrophoneId || undefined, voiceIsolationEnabled);
        } else if (agent instanceof DeepgramVoiceAgent) {
          const config: any = {
            systemPrompt,
            sttModel: modelConfig?.deepgramSttModel || "nova-3",
            ttsModel: modelConfig?.deepgramTtsModel || "aura-2-thalia-en",
            llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
            llmModel: modelConfig?.deepgramLlmModel,
          };
          await agent.connect(config);
          await agent.startMicrophone(selectedMicrophoneId || undefined, voiceIsolationEnabled);
        }

        // If the user re-muted while we were reconnecting, stop immediately
        if (isMutedRef.current) {
          if (agent instanceof HybridVoiceAgent || agent instanceof DeepgramVoiceAgent) {
            agent.stopMicrophone();
          }
          return;
        }

        setIsMicrophoneActive(true);
        setIsConnecting(false);
        startAudioVisualization();
        console.log('[PremiumVoiceInterface] ✅ Unmuted successfully - WebSocket reconnected and microphone active');
      } catch (err) {
        console.error('[PremiumVoiceInterface] ❌ Error reconnecting on unmute:', err);
        isMutedRef.current = true;
        setIsMuted(true);
        setIsMicrophoneActive(false);
        setIsConnecting(false);
        handleError(err instanceof Error ? err : new Error(String(err)));
      }
    } else {
      // User wants to mute - stop sending audio chunks but keep WebSocket open for TTS
      console.log('[PremiumVoiceInterface] 🔇 Muting - stopping microphone input but keeping WebSocket open for responses...');
      isMutedRef.current = true;
      setIsMuted(true);
      setIsMicrophoneActive(false);
      setIsSpeaking(false);

      try {
        if (agent instanceof SpeechmaticsVoiceAgent) {
          // Just mute the microphone - WebSocket stays open for receiving agent responses
          agent.setMicrophoneMuted(true);
          // Stop audio visualization but keep audio context for TTS playback
          cleanupAudioAnalysis(false); // false = don't close audio context
        } else {
          // For other agents, stop microphone but keep connection for responses
          await Promise.all([
            // Stop visualization stream
            Promise.resolve(cleanupAudioAnalysis(false)), // Keep audio context for TTS
            // Stop agent microphone stream (but keep connection for TTS)
            (async () => {
              if (agent instanceof HybridVoiceAgent || agent instanceof DeepgramVoiceAgent) {
                agent.stopMicrophone();
              }
            })()
          ]);
        }
        console.log('[PremiumVoiceInterface] ✅ Microphone muted - WebSocket remains open for agent responses');
      } catch (error) {
        console.error('[PremiumVoiceInterface] ❌ Error muting microphone:', error);
      }
    }
  }, [isMuted, isHybridAgent, isSpeechmaticsAgent, systemPrompt, modelConfig, cleanupAudioAnalysis, startAudioVisualization, handleError]);

  const connectRef = useRef(connect);
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnectRef = useRef(disconnect);
  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  const cleanupAudioAnalysisRef = useRef(cleanupAudioAnalysis);
  useEffect(() => {
    cleanupAudioAnalysisRef.current = cleanupAudioAnalysis;
  }, [cleanupAudioAnalysis]);

  // Load microphone devices on mount
  useEffect(() => {
    loadMicrophoneDevices();
  }, [loadMicrophoneDevices]);

  // Close microphone settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showMicrophoneSettings && !target.closest('.microphone-settings-container')) {
        setShowMicrophoneSettings(false);
      }
    };

    if (showMicrophoneSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMicrophoneSettings]);

  // Auto-connect on mount
  useEffect(() => {
    let isUnmounting = false;

    const doConnect = async () => {
      if (isUnmounting) {
        return;
      }
      if (isConnectingRef.current || isDisconnectingRef.current) {
        console.log('[PremiumVoiceInterface] ⚠️ Connection or disconnect in progress, skipping duplicate call');
        return;
      }
      await connectRef.current?.();
    };
    
    doConnect();
    
    return () => {
      isUnmounting = true;
      console.log('[PremiumVoiceInterface] 🧹 Component unmounting, cleaning up all streams...');
      void disconnectRef.current?.();
      cleanupAudioAnalysisRef.current?.(true); // Close audio context on unmount
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when component mounts (voice mode activated)
  useEffect(() => {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  /**
   * NEW SIMPLIFIED MESSAGE MERGING
   * Merge props.messages (source of truth) with optimisticCache (temporary interim messages)
   */
  const previousMessagesRef = useRef<Set<string>>(new Set());
  const isInitialMountRef = useRef(true);

  const allMessages = useMemo(() => {
    type DisplayMessage = VoiceMessage & { stableKey: string; isNew: boolean };
    const finalMap = new Map<string, DisplayMessage>();
    const currentKeys = new Set<string>();

    previousOptimisticCountRef.current = optimisticCache.size;
    previousPropsCountRef.current = messages.length;

    // Step 1: Add messages from optimistic cache first (interim messages)
    // These will be replaced by final messages if they have the same messageId
    for (const [id, cachedMsg] of optimisticCache) {
      currentKeys.add(id);
      const isNew = !previousMessagesRef.current.has(id);

      finalMap.set(id, {
        ...cachedMsg,
        stableKey: id,
        isNew,
      });
    }

    // Step 2: Add/Replace with messages from props (these are the source of truth - final messages)
    // If a message has the same messageId, it replaces the interim one
    messages.forEach(msg => {
      // Extract messageId from metadata if available (for voice messages)
      // This ensures we match the messageId used in optimistic cache
      const metadataMessageId = (msg.metadata as any)?.messageId;
      const messageId = metadataMessageId || msg.messageId;
      
      // Use messageId if available, otherwise fallback to content-based key
      const key = messageId || `${msg.role}-${msg.content.substring(0, 100)}`;
      currentKeys.add(key);
      const isNew = !previousMessagesRef.current.has(key);
      const existingInMap = finalMap.get(key);
      const hadInterim = existingInMap?.isInterim;

      // Always replace with final message (props.messages are final)
      finalMap.set(key, {
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp || new Date().toISOString(),
        messageId: messageId || undefined, // Use extracted messageId
        isInterim: false, // Messages from props are always final
        stableKey: key,
        isNew,
      });
    });

    // Step 3: Sort by timestamp
    const sorted = Array.from(finalMap.values()).sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    // Update tracking
    previousMessagesRef.current = currentKeys;
    isInitialMountRef.current = false;

    return sorted;
  }, [messages, optimisticCache]);

  // Clean up optimistic cache when messages arrive in props
  // This removes interim messages that have been finalized
  useEffect(() => {
    if (messages.length === 0) return;

    const propsMessageIds = new Set(
      messages.map(m => m.messageId).filter((id): id is string => Boolean(id))
    );

    setOptimisticCache(prev => {
      const next = new Map(prev);
      let hasChanges = false;
      const removedIds: string[] = [];

      // Remove any interim messages that now have a final version in props
      for (const id of propsMessageIds) {
        if (next.has(id)) {
          next.delete(id);
          removedIds.push(id);
          hasChanges = true;
        }
      }

      // Also remove any interim messages that are older than 5 seconds
      // This prevents stale interim messages from lingering
      const now = Date.now();
      for (const [id, cachedMsg] of next) {
        const msgTime = new Date(cachedMsg.timestamp).getTime();
        if (cachedMsg.isInterim && (now - msgTime > 5000)) {
          next.delete(id);
          removedIds.push(id);
          hasChanges = true;
        }
      }

      return hasChanges ? next : prev;
    });
  }, [messages, optimisticCache]);

  // Auto-scroll when new messages arrive
  const previousLengthRef = useRef(0);
  useEffect(() => {
    const hasNewMessages = allMessages.length > previousLengthRef.current;
    previousLengthRef.current = allMessages.length;

    if (hasNewMessages) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [allMessages]);

  /**
   * NEW PURE REACT TEXT COMPONENT
   * Uses Framer Motion for smooth animations without DOM manipulation
   */
  function AnimatedText({
    content,
    isInterim = false
  }: {
    content: string;
    isInterim?: boolean;
  }) {
    return (
      <motion.p
        key={content.substring(0, 50)} // Re-mount on major content change
        initial={{ opacity: 0.8 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className={cn(
          "text-sm leading-relaxed whitespace-pre-wrap font-normal tracking-wide",
          isInterim && "opacity-80"
        )}
        style={{ minHeight: "1em" }}
      >
        {content}
      </motion.p>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Dark base background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgb(15, 15, 25)',
          zIndex: 0,
        }}
      />
      
      {/* Complex multi-layer radial gradient background - darker with primary/accent colors */}
      <div 
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.4) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(255, 0, 128, 0.35) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(147, 51, 234, 0.3) 0%, transparent 60%),
            radial-gradient(circle at 10% 80%, rgba(59, 130, 246, 0.25) 0%, transparent 40%),
            radial-gradient(circle at 90% 20%, rgba(255, 0, 128, 0.3) 0%, transparent 40%),
            radial-gradient(circle at 30% 60%, rgba(147, 51, 234, 0.25) 0%, transparent 35%),
            radial-gradient(circle at 70% 40%, rgba(59, 130, 246, 0.2) 0%, transparent 35%),
            linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(147, 51, 234, 0.15) 50%, rgba(255, 0, 128, 0.15) 100%)
          `,
          zIndex: 1,
        }}
      />
      
      {/* Animated gradient overlay that responds to voice */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.25) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(255, 0, 128, 0.25) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(147, 51, 234, 0.2) 0%, transparent 60%)
          `,
          zIndex: 2,
        }}
        animate={{
          opacity: isSpeaking ? 0.5 : 0,
          scale: isSpeaking ? 1.1 : 1,
        }}
        transition={{
          duration: 0.3,
          ease: "easeOut",
        }}
      />

      {/* Content */}
      <div className="relative z-20 h-full flex flex-col">
        {/* Top bar with close button */}
        <div className="flex items-center justify-between p-4 pt-12">
          <div className="flex items-center gap-3">
            {user?.fullName && (
              <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-semibold text-sm">
                {user.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-white/90 text-sm font-medium">{getGreeting()},</div>
              <div className="text-white text-lg font-semibold">{getUserName()}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                console.log('[PremiumVoiceInterface] ✏️ Edit button clicked - disconnecting everything');
                disconnect();
                onEdit?.();
                onClose();
              }}
              className="h-10 w-10 text-white hover:bg-white/20 rounded-full"
              title="Éditer"
            >
              <Pencil className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                console.log('[PremiumVoiceInterface] ❌ Close button clicked - disconnecting everything');
                disconnect();
                onClose();
              }}
              className="h-10 w-10 text-white hover:bg-white/20 rounded-full"
              title="Fermer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Messages area with floating bubbles */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
        >
          {allMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <p className="text-white/60 text-sm mb-4">Try asking...</p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full max-w-md space-y-3"
              >
                {[
                  "What are the risks and potential benefits of using electric vehicles in urban areas?",
                  "Is there a connection between social media and the quality of sleep?",
                  "Is there a connection between sleep deprivation and increased risk for heart disease or other chronic conditions?",
                ].map((suggestion, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + idx * 0.1 }}
                    className="rounded-2xl px-4 py-3 backdrop-blur-xl bg-white/10 text-white/90 shadow-lg"
                    style={{
                      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
                    }}
                  >
                    <p className="text-sm leading-relaxed">{suggestion}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}
          <AnimatePresence mode="popLayout" initial={false}>
            {allMessages.map((message) => {
              const messageKey = message.stableKey;
              const isNewMessage = message.isNew;

              return (
                <motion.div
                  key={messageKey}
                  layout
                  initial={isNewMessage ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    duration: 0.2,
                    ease: "easeOut",
                    layout: { duration: 0.3 }
                  }}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-3 backdrop-blur-xl shadow-lg",
                      message.role === "user"
                        ? "bg-white/20 text-white"
                        : "bg-white/10 text-white/90"
                    )}
                    style={{
                      boxShadow: "0 8px 32px 0 rgba(0,0,0,0.2)",
                      willChange: "opacity, transform",
                    }}
                  >
                    <AnimatedText
                      content={message.content}
                      isInterim={message.isInterim}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {/* Invisible element at the bottom to scroll to */}
          <div ref={messagesEndRef} />
        </div>

        {/* Voice circle with waveform animation - positioned at bottom */}
        <div className="flex flex-col items-center justify-center pb-8 px-4">
          <div className="relative">
            {/* Outer glow rings */}
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{
                background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
                filter: 'blur(20px)',
                width: '120px',
                height: '120px',
                margin: '-60px 0 0 -60px',
              }}
            />
            
            {/* Main voice circle */}
            <motion.button
              onClick={toggleMute}
              disabled={!isConnected}
              className={cn(
                "relative w-24 h-24 rounded-full flex items-center justify-center",
                "bg-white/20 backdrop-blur-xl border-2 border-white/30",
                "shadow-2xl transition-all duration-300",
                isMuted && "opacity-50",
                !isConnected && "opacity-30 cursor-not-allowed"
              )}
              style={{
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1)',
              }}
              animate={{
                scale: isSpeaking ? [1, 1.1, 1] : 1,
              }}
              transition={{
                duration: 0.5,
                repeat: isSpeaking ? Infinity : 0,
                ease: "easeInOut",
              }}
            >
              {/* Waveform visualization - centered */}
              <svg
                width="96"
                height="96"
                viewBox="0 0 96 96"
                className="absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = (i * 360) / 12;
                  const baseRadius = 28;
                  const radius = baseRadius + audioLevel * 8;
                  const barWidth = 3;
                  const barHeight = 4 + audioLevel * 12;
                  const centerX = 48;
                  const centerY = 48;
                  const x1 = centerX + Math.cos((angle * Math.PI) / 180) * radius;
                  const y1 = centerY + Math.sin((angle * Math.PI) / 180) * radius;
                  const x2 = centerX + Math.cos((angle * Math.PI) / 180) * (radius + barHeight);
                  const y2 = centerY + Math.sin((angle * Math.PI) / 180) * (radius + barHeight);
                  
                  return (
                    <motion.line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="white"
                      strokeWidth={barWidth}
                      strokeLinecap="round"
                      opacity={0.9}
                      animate={{
                        x2: isSpeaking 
                          ? centerX + Math.cos((angle * Math.PI) / 180) * (radius + barHeight * (1.5 + audioLevel))
                          : x2,
                        y2: isSpeaking
                          ? centerY + Math.sin((angle * Math.PI) / 180) * (radius + barHeight * (1.5 + audioLevel))
                          : y2,
                        opacity: isSpeaking ? [0.9, 1, 0.9] : 0.6,
                      }}
                      transition={{
                        duration: 0.3,
                        delay: i * 0.03,
                        repeat: isSpeaking ? Infinity : 0,
                        ease: "easeInOut",
                      }}
                    />
                  );
                })}
              </svg>
              
              {/* Center icon */}
              {isMuted ? (
                <MicOff className="h-8 w-8 text-white relative z-10" />
              ) : (
                <Volume2 className="h-8 w-8 text-white relative z-10" />
              )}
            </motion.button>
          </div>
          
          {/* Status text */}
          <div className="text-center mt-4">
            <p className="text-white/80 text-sm">
              {isConnecting && "Connecting..."}
              {isConnected && !isMuted && !isSpeaking && "Listening... Speak naturally"}
              {isConnected && !isMuted && isSpeaking && "🎤 You're speaking..."}
              {isConnected && isMuted && "Microphone muted"}
              {error && <span className="text-red-300">{error}</span>}
            </p>
          </div>

          {/* Microphone settings - compact dropdown */}
          <div className="relative mt-4 microphone-settings-container">
            <button
              onClick={() => setShowMicrophoneSettings(!showMicrophoneSettings)}
              className="p-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-colors"
              aria-label="Microphone settings"
            >
              <Settings className="h-5 w-5 text-white/80" />
            </button>

            {/* Dropdown menu */}
            {showMicrophoneSettings && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-gray-900/95 backdrop-blur-xl border border-white/20 rounded-lg shadow-2xl p-4 z-50 microphone-settings-container">
                <div className="flex flex-col gap-3">
                  {/* Microphone selector */}
                  <div className="flex flex-col gap-1">
                    <label className="text-white/70 text-xs">Microphone</label>
                    <select
                      value={selectedMicrophoneId || ''}
                      onChange={(e) => {
                        setSelectedMicrophoneId(e.target.value);
                        savePreferences();
                      }}
                      disabled={isConnected}
                      className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {availableMicrophones.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId} className="bg-gray-800">
                          {mic.label || `Microphone ${mic.deviceId.substring(0, 8)}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sensitivity slider */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <label className="text-white/70 text-xs">Sensibilité</label>
                      <span className="text-white/80 text-xs">{microphoneSensitivity.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={microphoneSensitivity}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        setMicrophoneSensitivity(value);
                        savePreferences();
                        // Update sensitivity in real-time if connected
                        if (isConnected && agentRef.current instanceof SpeechmaticsVoiceAgent) {
                          agentRef.current.setMicrophoneSensitivity?.(value);
                        }
                      }}
                      disabled={isConnected}
                      className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: `linear-gradient(to right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.3) ${((microphoneSensitivity - 0.5) / 2.5) * 100}%, rgba(255,255,255,0.1) ${((microphoneSensitivity - 0.5) / 2.5) * 100}%, rgba(255,255,255,0.1) 100%)`
                      }}
                    />
                  </div>

                  {/* Voice isolation toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-white/70 text-xs">Isolation de voix</label>
                    <button
                      onClick={() => {
                        setVoiceIsolationEnabled(!voiceIsolationEnabled);
                        savePreferences();
                      }}
                      disabled={isConnected}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        voiceIsolationEnabled ? "bg-white/30" : "bg-white/10",
                        isConnected && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                          voiceIsolationEnabled ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



