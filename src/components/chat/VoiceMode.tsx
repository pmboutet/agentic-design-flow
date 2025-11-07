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
    sttModel?: string;
    ttsModel?: string;
    llmProvider?: "anthropic" | "openai";
    llmModel?: string;
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
      setError(null);
      const agent = new DeepgramVoiceAgent();
      agentRef.current = agent;

      agent.setCallbacks({
        onMessage: handleMessage,
        onError: handleError,
        onConnection: handleConnectionChange,
      });

      const config: DeepgramConfig = {
        systemPrompt,
        sttModel: modelConfig?.sttModel || "nova-2",
        ttsModel: modelConfig?.ttsModel || "aura-thalia-en",
        llmProvider: modelConfig?.llmProvider || "anthropic",
        llmModel: modelConfig?.llmModel || "claude-3-5-sonnet-20241022",
      };

      await agent.connect(config);
      await agent.startMicrophone();
      setIsMicrophoneActive(true);
    } catch (err) {
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
            {isConnected ? 'Voice Mode Active' : 'Connecting...'}
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
          disabled={!isConnected && !error}
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
        {!isConnected && (
          <p>Connecting to voice agent...</p>
        )}
      </div>
    </div>
  );
}

