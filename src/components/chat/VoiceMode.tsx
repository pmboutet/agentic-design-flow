"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeepgramVoiceAgent, DeepgramConfig, DeepgramMessageEvent } from '@/lib/ai/deepgram';
import { HybridVoiceAgent, HybridVoiceAgentConfig, HybridVoiceAgentMessage } from '@/lib/ai/hybrid-voice-agent';
import { SpeechmaticsVoiceAgent, SpeechmaticsConfig, SpeechmaticsMessageEvent } from '@/lib/ai/speechmatics';
import { cn } from '@/lib/utils';

interface VoiceModeProps {
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
  };
  onMessage: (message: DeepgramMessageEvent | HybridVoiceAgentMessage | SpeechmaticsMessageEvent) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export function VoiceMode({
  askKey,
  askSessionId,
  systemPrompt,
  userPrompt,
  modelConfig,
  onMessage,
  onError,
  onClose,
}: VoiceModeProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const agentRef = useRef<DeepgramVoiceAgent | HybridVoiceAgent | SpeechmaticsVoiceAgent | null>(null);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHybridAgent = modelConfig?.provider === "hybrid-voice-agent";
  // Use voiceAgentProvider if available, otherwise fall back to provider
  const voiceAgentProvider = modelConfig?.voiceAgentProvider || modelConfig?.provider;
  const isSpeechmaticsAgent = voiceAgentProvider === "speechmatics-voice-agent";
  
  // Debug log
  useEffect(() => {
    console.log('[VoiceMode] 🎤 Voice Agent Selection:', {
      provider: modelConfig?.provider,
      voiceAgentProvider: modelConfig?.voiceAgentProvider,
      effectiveProvider: voiceAgentProvider,
      isSpeechmaticsAgent,
      isHybridAgent,
      modelConfigKeys: modelConfig ? Object.keys(modelConfig) : [],
    });
  }, [modelConfig, voiceAgentProvider, isSpeechmaticsAgent, isHybridAgent]);

  const handleMessage = useCallback((message: DeepgramMessageEvent | HybridVoiceAgentMessage | SpeechmaticsMessageEvent) => {
    const isInterim = Boolean(message.isInterim);
    const messageId = (message as SpeechmaticsMessageEvent).messageId;

    // Detect when user is speaking
    if (message.role === 'user') {
      setIsSpeaking(true);
      // Reset speaking state after a delay
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
      speakingTimeoutRef.current = setTimeout(() => {
        setIsSpeaking(false);
      }, 2000);
    }

    // For interim messages with messageId, pass them through for streaming updates
    // Otherwise, ignore interim messages
    if (isInterim && !messageId) {
      return;
    }

    // Pass all messages (including interim with messageId) to parent
    onMessage(message);
  }, [onMessage]);

  const handleError = useCallback((error: Error) => {
    setError(error.message);
    onError(error);
  }, [onError]);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
    if (!connected && agentRef.current) {
      setIsMicrophoneActive(false);
      setIsSpeaking(false);
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      console.log('[VoiceMode] 🔌 Starting connection...');
      setError(null);
      setIsConnecting(true);

      if (isHybridAgent) {
        // Use HybridVoiceAgent (Deepgram STT + LLM + ElevenLabs TTS)
        const agent = new HybridVoiceAgent();
        agentRef.current = agent;

        agent.setCallbacks({
          onMessage: handleMessage,
          onError: handleError,
          onConnection: handleConnectionChange,
        });

        const config: HybridVoiceAgentConfig = {
          systemPrompt,
          sttModel: modelConfig?.deepgramSttModel || "nova-3",
          llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
          llmModel: modelConfig?.deepgramLlmModel,
          elevenLabsVoiceId: modelConfig?.elevenLabsVoiceId,
          elevenLabsModelId: modelConfig?.elevenLabsModelId || "eleven_turbo_v2_5",
        };

        console.log('[VoiceMode] Hybrid agent configuration:', config);
        console.log('[VoiceMode] Calling hybrid agent.connect()...');
        await agent.connect(config);
        console.log('[VoiceMode] ✅ Hybrid connection established, starting microphone...');
        await agent.startMicrophone();
        console.log('[VoiceMode] ✅ Microphone started');
      } else if (isSpeechmaticsAgent) {
        // Use SpeechmaticsVoiceAgent (Speechmatics STT + LLM + ElevenLabs TTS)
        const agent = new SpeechmaticsVoiceAgent();
        agentRef.current = agent;

        agent.setCallbacks({
          onMessage: handleMessage,
          onError: handleError,
          onConnection: handleConnectionChange,
        });

        const config: SpeechmaticsConfig = {
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
        };

        console.log('[VoiceMode] Speechmatics configuration:', config);
        console.log('[VoiceMode] Calling Speechmatics agent.connect()...');
        await agent.connect(config);
        console.log('[VoiceMode] ✅ Speechmatics connection established, starting microphone...');
        await agent.startMicrophone();
        console.log('[VoiceMode] ✅ Microphone started');
      } else {
        // Use DeepgramVoiceAgent (default)
        const agent = new DeepgramVoiceAgent();
        agentRef.current = agent;

        agent.setCallbacks({
          onMessage: handleMessage,
          onError: handleError,
          onConnection: handleConnectionChange,
        });

        const config: DeepgramConfig = {
          systemPrompt,
          sttModel: modelConfig?.deepgramSttModel || "nova-3",
          ttsModel: modelConfig?.deepgramTtsModel || "aura-2-thalia-en",
          llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
          llmModel: modelConfig?.deepgramLlmModel,
        };

        console.log('[VoiceMode] Deepgram configuration:', config);
        console.log('[VoiceMode] Calling agent.connect()...');
        await agent.connect(config);
        console.log('[VoiceMode] ✅ Connection established, starting microphone...');
        await agent.startMicrophone();
        console.log('[VoiceMode] ✅ Microphone started');
      }

      setIsMicrophoneActive(true);
      setIsConnecting(false);
    } catch (err) {
      console.error('[VoiceMode] ❌ Connection error:', err);
      setIsConnecting(false);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to voice agent';
      setError(errorMessage);
      handleError(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [systemPrompt, modelConfig, isHybridAgent, isSpeechmaticsAgent, handleMessage, handleError, handleConnectionChange]);

  const disconnect = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.disconnect();
      agentRef.current = null;
    }
    setIsConnected(false);
    setIsMicrophoneActive(false);
    setIsSpeaking(false);
    setError(null);
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
    }
  }, []);

  const toggleMute = useCallback(async () => {
    const agent = agentRef.current;
    if (!agent) {
      return;
    }

    if (isMuted) {
      // User wants to unmute - need to reconnect WebSocket and restart microphone
      console.log('[VoiceMode] 🔊 Unmuting - reconnecting WebSocket and restarting microphone...');
      setIsConnecting(true);

      try {
        // Reconnect WebSocket first (since stopMicrophone() closed it)
        if (agent instanceof SpeechmaticsVoiceAgent) {
          agent.setMicrophoneMuted(false);
          setIsMuted(false);
          setIsMicrophoneActive(true);
          setIsConnecting(false);
          console.log('[VoiceMode] ✅ Speechmatics unmuted - microphone resumed');
          return;
        } else if (isHybridAgent && agent instanceof HybridVoiceAgent) {
          const config: HybridVoiceAgentConfig = {
            systemPrompt,
            sttModel: modelConfig?.deepgramSttModel || "nova-3",
            llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
            llmModel: modelConfig?.deepgramLlmModel,
            elevenLabsVoiceId: modelConfig?.elevenLabsVoiceId,
            elevenLabsModelId: modelConfig?.elevenLabsModelId || "eleven_turbo_v2_5",
          };
          await agent.connect(config);
          await agent.startMicrophone();
        } else if (agent instanceof DeepgramVoiceAgent) {
          const config: DeepgramConfig = {
            systemPrompt,
            sttModel: modelConfig?.deepgramSttModel || "nova-3",
            ttsModel: modelConfig?.deepgramTtsModel || "aura-2-thalia-en",
            llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
            llmModel: modelConfig?.deepgramLlmModel,
          };
          await agent.connect(config);
          await agent.startMicrophone();
        }

        setIsMuted(false);
        setIsMicrophoneActive(true);
        setIsConnecting(false);
        console.log('[VoiceMode] ✅ Unmuted successfully - WebSocket reconnected and microphone active');
      } catch (error) {
        console.error('[VoiceMode] ❌ Error reconnecting on unmute:', error);
        setIsMuted(true);
        setIsMicrophoneActive(false);
        setIsConnecting(false);
        handleError(error instanceof Error ? error : new Error(String(error)));
      }
    } else {
      // User wants to mute - stop microphone and close WebSocket
      console.log('[VoiceMode] 🔇 Muting - stopping microphone and closing WebSocket...');
      
      if (agent instanceof SpeechmaticsVoiceAgent) {
        agent.setMicrophoneMuted(true);
      } else if (isHybridAgent && agent instanceof HybridVoiceAgent) {
        agent.stopMicrophone();
      } else if (agent instanceof DeepgramVoiceAgent) {
        agent.stopMicrophone();
      }
      
      setIsMuted(true);
      setIsMicrophoneActive(false);
      setIsSpeaking(false);
      console.log('[VoiceMode] ✅ Muted successfully - WebSocket closed');
    }
  }, [isMuted, isHybridAgent, systemPrompt, modelConfig, handleError]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    // Cleanup on unmount
    return () => {
      disconnect();
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative border rounded-lg p-4 bg-muted/50 space-y-3 overflow-hidden">
      {/* Animated gradient background */}
      <div 
        className={cn(
          "absolute inset-0 opacity-30 transition-all duration-500 ease-in-out",
          isMicrophoneActive && !isMuted && isSpeaking
            ? "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-gradient-shift"
            : isMicrophoneActive && !isMuted
            ? "bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400"
            : "bg-gradient-to-r from-gray-300 to-gray-400"
        )}
      />
      
      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-3 w-3 rounded-full transition-all duration-300",
              isConnected ? "bg-green-500 animate-pulse" : isConnecting ? "bg-yellow-500 animate-pulse" : "bg-gray-400"
            )} />
            <span className="text-sm font-medium">
              {isConnected ? 'Voice Mode Active' : isConnecting ? 'Connecting...' : 'Connecting...'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              disconnect();
              onClose();
            }}
            className="h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded mt-2">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2">
          {isConnected && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnect}
                className="border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
              >
                <MicOff className="h-4 w-4 mr-2" />
                Raccrocher
              </Button>

              <Button
                variant={isMuted ? "outline" : "default"}
                size="sm"
                onClick={toggleMute}
              >
                {isMuted ? (
                  <>
                    <VolumeX className="h-4 w-4 mr-2" />
                    Unmute
                  </>
                ) : (
                  <>
                    <Volume2 className="h-4 w-4 mr-2" />
                    Mute
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {isMicrophoneActive && !isMuted && (
            <p className={cn(
              "transition-colors duration-300",
              isSpeaking && "text-blue-600 dark:text-blue-400 font-medium"
            )}>
              {isSpeaking ? "🎤 Vous parlez..." : "Écoute... Parlez naturellement et l'agent répondra."}
            </p>
          )}
          {isMuted && (
            <p>Microphone is muted. Unmute to continue speaking.</p>
          )}
          {isConnecting && (
            <p className="text-blue-600 dark:text-blue-400">Connexion en cours...</p>
          )}
        </div>
      </div>
    </div>
  );
}
