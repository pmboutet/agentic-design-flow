/**
 * Types and interfaces for Speechmatics Voice Agent
 */

export interface SpeechmaticsConfig {
  systemPrompt: string;
  userPrompt?: string; // User prompt template (same as text mode)
  // Prompt variables for template rendering (same as text mode)
  promptVariables?: Record<string, string | null | undefined>; // Variables for userPrompt template rendering
  // Speechmatics STT config
  sttLanguage?: string; // e.g., "fr", "en", "multi", "fr,en"
  sttOperatingPoint?: "enhanced" | "standard";
  sttMaxDelay?: number; // Max delay between segments (default: 2.0)
  sttEnablePartials?: boolean; // Enable partial transcription results
  // Microphone sensitivity config
  microphoneSensitivity?: number; // VAD threshold multiplier (0.5 = more sensitive, 2.0 = less sensitive, default: 1.0)
  microphoneDeviceId?: string; // Device ID for specific microphone selection
  voiceIsolation?: boolean; // Enable voice isolation (noise suppression, echo cancellation)
  // LLM config
  llmProvider?: "anthropic" | "openai";
  llmModel?: string;
  llmApiKey?: string;
  enableThinking?: boolean;
  thinkingBudgetTokens?: number;
  // ElevenLabs TTS config
  elevenLabsApiKey?: string; // Optional - will be fetched automatically if not provided
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
  disableElevenLabsTTS?: boolean; // If true, disable ElevenLabs TTS (only STT will work)
}

export interface SpeechmaticsMessageEvent {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  isInterim?: boolean;
  messageId?: string; // Unique ID for streaming message updates
}

export type SpeechmaticsMessageCallback = (message: SpeechmaticsMessageEvent) => void;
export type SpeechmaticsErrorCallback = (error: Error) => void;
export type SpeechmaticsConnectionCallback = (connected: boolean) => void;
export type SpeechmaticsAudioCallback = (audio: Uint8Array) => void;
