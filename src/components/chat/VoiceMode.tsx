"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeepgramVoiceAgent, DeepgramConfig, DeepgramMessageEvent } from '@/lib/ai/deepgram';
import { HybridVoiceAgent, HybridVoiceAgentConfig, HybridVoiceAgentMessage } from '@/lib/ai/hybrid-voice-agent';
import { cn } from '@/lib/utils';

interface VoiceModeProps {
  askKey: string;
  askSessionId?: string;
  systemPrompt: string;
  modelConfig?: {
    provider?: "deepgram-voice-agent" | "hybrid-voice-agent";
    deepgramSttModel?: string;
    deepgramTtsModel?: string;
    deepgramLlmProvider?: "anthropic" | "openai";
    deepgramLlmModel?: string;
    elevenLabsVoiceId?: string;
    elevenLabsModelId?: string;
  };
  onMessage: (message: DeepgramMessageEvent | HybridVoiceAgentMessage) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export function VoiceMode({
  askKey,
  askSessionId,
  systemPrompt,
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
  const agentRef = useRef<DeepgramVoiceAgent | HybridVoiceAgent | null>(null);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHybridAgent = modelConfig?.provider === "hybrid-voice-agent";

  const handleMessage = useCallback((message: DeepgramMessageEvent | HybridVoiceAgentMessage) => {
    const isInterim = Boolean(message.isInterim);

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

    if (isInterim) {
      return;
    }

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
          sttModel: modelConfig?.deepgramSttModel || "nova-2",
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
          sttModel: modelConfig?.deepgramSttModel || "nova-2",
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
  }, [systemPrompt, modelConfig, isHybridAgent, handleMessage, handleError, handleConnectionChange]);

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

  const toggleMute = useCallback(() => {
    // Note: Both agents don't have a direct mute API
    // We'll stop/restart microphone as a workaround
    if (isMuted && agentRef.current) {
      if (isHybridAgent && agentRef.current instanceof HybridVoiceAgent) {
        agentRef.current.startMicrophone().then(() => {
          setIsMuted(false);
          setIsMicrophoneActive(true);
        }).catch(error => {
          setIsMuted(true);
          setIsMicrophoneActive(false);
          handleError(error);
        });
      } else if (agentRef.current instanceof DeepgramVoiceAgent) {
        agentRef.current.startMicrophone().then(() => {
          setIsMuted(false);
          setIsMicrophoneActive(true);
        }).catch(error => {
          setIsMuted(true);
          setIsMicrophoneActive(false);
          handleError(error);
        });
      }
    } else if (agentRef.current) {
      if (isHybridAgent && agentRef.current instanceof HybridVoiceAgent) {
        agentRef.current.stopMicrophone();
        setIsMuted(true);
        setIsMicrophoneActive(false);
        setIsSpeaking(false);
      } else if (agentRef.current instanceof DeepgramVoiceAgent) {
        agentRef.current.stopMicrophone();
        setIsMuted(true);
        setIsMicrophoneActive(false);
        setIsSpeaking(false);
      }
    }
  }, [isMuted, isHybridAgent, handleError]);

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
