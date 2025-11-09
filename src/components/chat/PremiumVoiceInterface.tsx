"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeepgramVoiceAgent, DeepgramMessageEvent } from '@/lib/ai/deepgram';
import { HybridVoiceAgent, HybridVoiceAgentMessage } from '@/lib/ai/hybrid-voice-agent';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';

interface PremiumVoiceInterfaceProps {
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
  messages?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
  }>;
}

export function PremiumVoiceInterface({
  askKey,
  askSessionId,
  systemPrompt,
  modelConfig,
  onMessage,
  onError,
  onClose,
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
  const [voiceMessages, setVoiceMessages] = useState<Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>>([]);
  
  const agentRef = useRef<DeepgramVoiceAgent | HybridVoiceAgent | null>(null);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isHybridAgent = modelConfig?.provider === "hybrid-voice-agent";

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
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      microphone.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      streamRef.current = stream;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateAudioLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalizedLevel = Math.min(average / 128, 1);
        setAudioLevel(normalizedLevel);
        
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };
      
      updateAudioLevel();
    } catch (err) {
      console.error('Error setting up audio analysis:', err);
    }
  }, []);

  // Cleanup audio analysis
  const cleanupAudioAnalysis = useCallback(() => {
    console.log('[PremiumVoiceInterface] 🧹 Cleaning up audio analysis...');
    
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Stop and close audio context
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
        console.log('[PremiumVoiceInterface] ✅ Audio context closed');
      } catch (error) {
        console.warn('[PremiumVoiceInterface] Error closing audio context:', error);
      }
      audioContextRef.current = null;
    }
    
    // Stop all media stream tracks
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
        console.warn('[PremiumVoiceInterface] Error stopping stream tracks:', error);
      }
    }
    
    analyserRef.current = null;
    setAudioLevel(0);
    console.log('[PremiumVoiceInterface] ✅ Audio analysis cleanup complete');
  }, []);

  const handleMessage = useCallback((message: DeepgramMessageEvent | HybridVoiceAgentMessage) => {
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
    
    // Add to voice messages
    setVoiceMessages(prev => [...prev, {
      role: message.role === 'agent' ? 'assistant' : message.role,
      content: message.content,
      timestamp: new Date().toISOString(),
    }]);
    
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
      cleanupAudioAnalysis();
    }
  }, [cleanupAudioAnalysis]);

  const connect = useCallback(async () => {
    try {
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
          sttModel: modelConfig?.deepgramSttModel || "nova-2",
          llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
          llmModel: modelConfig?.deepgramLlmModel,
          elevenLabsVoiceId: modelConfig?.elevenLabsVoiceId,
          elevenLabsModelId: modelConfig?.elevenLabsModelId || "eleven_turbo_v2_5",
        };

        await agent.connect(config);
        await agent.startMicrophone();
        
        // Setup audio analysis after microphone is started
        // We'll create a separate stream for visualization
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          await setupAudioAnalysis(stream);
        } catch (audioErr) {
          console.warn('[PremiumVoiceInterface] Could not setup audio analysis:', audioErr);
          // Continue without audio visualization
        }
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
          sttModel: modelConfig?.deepgramSttModel || "nova-2",
          ttsModel: modelConfig?.deepgramTtsModel || "aura-2-thalia-en",
          llmProvider: (modelConfig?.deepgramLlmProvider as "anthropic" | "openai") || "anthropic",
          llmModel: modelConfig?.deepgramLlmModel,
        };

        await agent.connect(config);
        await agent.startMicrophone();
        
        // Setup audio analysis after microphone is started
        // We'll create a separate stream for visualization
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          await setupAudioAnalysis(stream);
        } catch (audioErr) {
          console.warn('[PremiumVoiceInterface] Could not setup audio analysis:', audioErr);
          // Continue without audio visualization
        }
      }

      setIsMicrophoneActive(true);
      setIsConnecting(false);
    } catch (err) {
      console.error('[PremiumVoiceInterface] ❌ Connection error:', err);
      setIsConnecting(false);
      cleanupAudioAnalysis();
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to voice agent';
      setError(errorMessage);
      handleError(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [systemPrompt, modelConfig, isHybridAgent, handleMessage, handleError, handleConnectionChange, setupAudioAnalysis, cleanupAudioAnalysis]);

  const disconnect = useCallback(() => {
    console.log('[PremiumVoiceInterface] 🔌 Disconnecting...');
    
    // Cleanup audio analysis FIRST (stops the separate stream for visualization)
    cleanupAudioAnalysis();
    
    // Disconnect agent (this will stop the agent's microphone stream)
    if (agentRef.current) {
      try {
        agentRef.current.disconnect();
        console.log('[PremiumVoiceInterface] ✅ Agent disconnected');
      } catch (error) {
        console.warn('[PremiumVoiceInterface] Error disconnecting agent:', error);
      }
      agentRef.current = null;
    }
    
    // Note: We can't directly enumerate active streams, but cleanupAudioAnalysis and agent.disconnect()
    // should have stopped all tracks. If microphone is still active, check browser permissions.
    
    // Reset all state
    setIsConnected(false);
    setIsMicrophoneActive(false);
    setIsSpeaking(false);
    setError(null);
    
    // Clear timeout
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
    
    console.log('[PremiumVoiceInterface] ✅ Disconnection complete');
  }, [cleanupAudioAnalysis]);

  const toggleMute = useCallback(() => {
    if (isMuted && agentRef.current) {
      if (isHybridAgent && agentRef.current instanceof HybridVoiceAgent) {
        agentRef.current.startMicrophone().then(() => {
          setIsMuted(false);
        }).catch(handleError);
      } else if (agentRef.current instanceof DeepgramVoiceAgent) {
        agentRef.current.startMicrophone().then(() => {
          setIsMuted(false);
        }).catch(handleError);
      }
    } else if (agentRef.current) {
      if (isHybridAgent && agentRef.current instanceof HybridVoiceAgent) {
        agentRef.current.stopMicrophone();
        setIsMuted(true);
      } else if (agentRef.current instanceof DeepgramVoiceAgent) {
        agentRef.current.stopMicrophone();
        setIsMuted(true);
      }
    }
  }, [isMuted, isHybridAgent, handleError]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      console.log('[PremiumVoiceInterface] 🧹 Component unmounting, cleaning up all streams...');
      disconnect();
      // Extra safety cleanup - ensure all streams are stopped
      cleanupAudioAnalysis();
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, [disconnect, cleanupAudioAnalysis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Combine voice messages with initial messages
  const allMessages = [...messages, ...voiceMessages];

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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              disconnect();
              onClose();
            }}
            className="h-10 w-10 text-white hover:bg-white/20 rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Messages area with floating bubbles */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
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
          <AnimatePresence>
            {allMessages.map((message, index) => (
              <motion.div
                key={`${message.timestamp}-${index}`}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.9 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={cn(
                  "flex",
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-3 backdrop-blur-xl",
                    message.role === 'user'
                      ? "bg-white/20 text-white shadow-lg"
                      : "bg-white/10 text-white/90 shadow-lg"
                  )}
                  style={{
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
                  }}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
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
        </div>
      </div>
    </div>
  );
}

