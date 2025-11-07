"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeepgramVoiceAgent, DeepgramConfig, DeepgramMessageEvent } from '@/lib/ai/deepgram';
import { cn } from '@/lib/utils';

interface VoiceModeProps {
  askKey: string;
  askSessionId?: string;
  systemPrompt: string;
  modelConfig?: {
    deepgramSttModel?: string;
    deepgramTtsModel?: string;
    deepgramLlmProvider?: "anthropic" | "openai";
    deepgramLlmModel?: string;
  };
  onMessage: (message: DeepgramMessageEvent) => void;
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
  const agentRef = useRef<DeepgramVoiceAgent | null>(null);

  const handleMessage = useCallback((message: DeepgramMessageEvent) => {
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
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      console.log('[VoiceMode] 🔌 Starting connection...');
      setError(null);
      setIsConnecting(true);
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
        llmModel: modelConfig?.deepgramLlmModel, // Use exact model name from database, no fallback
      };

      console.log('[VoiceMode] Configuration:', config);
      console.log('[VoiceMode] Calling agent.connect()...');
      await agent.connect(config);
      console.log('[VoiceMode] ✅ Connection established, starting microphone...');
      await agent.startMicrophone();
      console.log('[VoiceMode] ✅ Microphone started');
      setIsMicrophoneActive(true);
      setIsConnecting(false);
    } catch (err) {
      console.error('[VoiceMode] ❌ Connection error:', err);
      setIsConnecting(false);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to voice agent';
      setError(errorMessage);
      handleError(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [systemPrompt, modelConfig, handleMessage, handleError, handleConnectionChange]);

  const disconnect = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.disconnect();
      agentRef.current = null;
    }
    setIsConnected(false);
    setIsMicrophoneActive(false);
    setError(null);
  }, []);

  const toggleMute = useCallback(() => {
    // Note: Deepgram SDK doesn't have a direct mute API
    // We'll stop/restart microphone as a workaround
    if (isMuted && agentRef.current) {
      agentRef.current.startMicrophone().then(() => {
        setIsMuted(false);
      }).catch(handleError);
    } else if (agentRef.current) {
      agentRef.current.stopMicrophone();
      setIsMuted(true);
    }
  }, [isMuted, handleError]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="border rounded-lg p-4 bg-muted/50 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-3 w-3 rounded-full",
            isConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"
          )} />
          <span className="text-sm font-medium">
            {isConnected ? 'Voice Mode Active' : isConnecting ? 'Connecting to voice agent...' : 'Ready to connect'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant={isMicrophoneActive ? "default" : "outline"}
          size="sm"
          onClick={isConnected ? disconnect : connect}
          disabled={isConnecting}
        >
          {isConnected ? (
            <>
              <MicOff className="h-4 w-4 mr-2" />
              Disconnect
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 mr-2" />
              Connect
            </>
          )}
        </Button>

        {isConnected && (
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
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        {isMicrophoneActive && !isMuted && (
          <p>Listening... Speak naturally and the agent will respond.</p>
        )}
        {isMuted && (
          <p>Microphone is muted. Unmute to continue speaking.</p>
        )}
        {isConnecting && (
          <p className="text-blue-600 dark:text-blue-400">Connecting to voice agent... Check console for details.</p>
        )}
        {!isConnected && !isConnecting && (
          <p>Click Connect to start voice mode.</p>
        )}
      </div>
    </div>
  );
}

