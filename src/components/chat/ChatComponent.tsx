"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Paperclip, Mic, Image, FileText, X, Radio, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatComponentProps, Message, FileUpload, ConversationPlan } from "@/types";
import {
  cn,
  validateFileType,
  formatFileSize,
} from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { PremiumVoiceInterface } from "./PremiumVoiceInterface";
import { DeepgramMessageEvent } from "@/lib/ai/deepgram";
import { HybridVoiceAgentMessage } from "@/lib/ai/hybrid-voice-agent";
import { SpeechmaticsMessageEvent } from "@/lib/ai/speechmatics";

/**
 * Chat component that handles all conversation interactions
 * Supports text, audio, image, and document uploads
 * Displays time remaining and handles ASK status
 */
export function ChatComponent({
  askKey,
  ask,
  messages,
  conversationPlan,
  onSendMessage,
  isLoading,
  onHumanTyping,
  currentParticipantName,
  isMultiUser,
  showAgentTyping,
  voiceModeEnabled = false,
  voiceModeSystemPrompt,
  voiceModeUserPrompt,
  voiceModePromptVariables,
  voiceModeModelConfig,
  onVoiceMessage,
  onReplyBoxFocusChange,
  onVoiceModeChange,
  onInitConversation,
  onEditMessage,
}: ChatComponentProps) {
  // Temporarily disabled to reduce log spam
  // console.log('[ChatComponent] 🔄 Rendering', {
  //   voiceModeEnabled,
  //   hasSystemPrompt: !!voiceModeSystemPrompt,
  //   hasUserPrompt: !!voiceModeUserPrompt,
  //   hasModelConfig: !!voiceModeModelConfig
  // });

  const [inputValue, setInputValue] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileUpload[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  // Edit mode state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousVoiceModeRef = useRef(false);

  // Check if all steps are completed
  const allStepsCompleted = conversationPlan && conversationPlan.plan_data.steps.length > 0 
    ? conversationPlan.plan_data.steps.every(step => step.status === 'completed')
    : false;

  // Auto-scroll to bottom when new messages arrive (smooth for normal chat)
  useEffect(() => {
    if (!isVoiceMode) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isVoiceMode]);

  // Scroll to bottom instantly when entering voice mode (no animation)
  useEffect(() => {
    if (isVoiceMode && !previousVoiceModeRef.current) {
      // Just entered voice mode - scroll instantly to bottom
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
    previousVoiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const notifyTyping = (isTyping: boolean) => {
    if (!onHumanTyping) return;
    onHumanTyping(isTyping);
  };

  const scheduleTypingStop = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      notifyTyping(false);
    }, 1500);
  };

  // Handle starting edit mode for a message
  const handleStartEdit = useCallback((messageId: string, currentContent: string) => {
    setEditingMessageId(messageId);
    setEditContent(currentContent);
  }, []);

  // Handle canceling edit
  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditContent("");
  }, []);

  // Handle submitting the edit
  const handleSubmitEdit = useCallback(async () => {
    if (!editingMessageId || !editContent.trim() || !onEditMessage) return;

    setIsSubmittingEdit(true);
    try {
      await onEditMessage(editingMessageId, editContent.trim());
      setEditingMessageId(null);
      setEditContent("");
    } catch (error) {
      console.error('Error editing message:', error);
    } finally {
      setIsSubmittingEdit(false);
    }
  }, [editingMessageId, editContent, onEditMessage]);

  // Handle sending messages
  const handleSendMessage = async () => {
    if (!inputValue.trim() && selectedFiles.length === 0) return;

    notifyTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (selectedFiles.length > 0) {
      // Handle file uploads
      for (const fileUpload of selectedFiles) {
        const fileReader = new FileReader();
        fileReader.onload = (e) => {
          const content = e.target?.result as string;
          onSendMessage(content, fileUpload.type, {
            fileName: fileUpload.file.name,
            fileSize: fileUpload.file.size,
            mimeType: fileUpload.file.type,
          });
        };
        
        if (fileUpload.type === 'image') {
          fileReader.readAsDataURL(fileUpload.file);
        } else {
          fileReader.readAsArrayBuffer(fileUpload.file);
        }
      }
    }
    
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim(), 'text');
    }

    setInputValue("");
    setSelectedFiles([]);
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (value.trim()) {
      notifyTyping(true);
      scheduleTypingStop();
    } else {
      notifyTyping(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (files: FileList) => {
    const newFiles: FileUpload[] = [];
    
    Array.from(files).forEach((file) => {
      const validation = validateFileType(file);
      if (validation.isValid && validation.type) {
        const fileUpload: FileUpload = {
          file,
          type: validation.type,
        };
        
        // Create preview for images
        if (validation.type === 'image') {
          const reader = new FileReader();
          reader.onload = (e) => {
            fileUpload.preview = e.target?.result as string;
            setSelectedFiles(prev => [...prev, fileUpload]);
          };
          reader.readAsDataURL(file);
        } else {
          newFiles.push(fileUpload);
        }
      }
    });
    
    if (newFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
  };

  // Handle audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });
        
        const fileUpload: FileUpload = {
          file: audioFile,
          type: 'audio',
        };
        
        setSelectedFiles(prev => [...prev, fileUpload]);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Handle voice mode messages (mémorisé pour éviter les remounts)
  const handleVoiceMessage = useCallback((message: DeepgramMessageEvent | HybridVoiceAgentMessage | SpeechmaticsMessageEvent) => {
    if (onVoiceMessage) {
      // Pass the full message object to allow parent to handle messageId and isInterim
      onVoiceMessage(message.role, message.content, {
        isInterim: message.isInterim,
        messageId: (message as SpeechmaticsMessageEvent).messageId,
        timestamp: message.timestamp,
      });
    }
  }, [onVoiceMessage]);

  const handleVoiceError = useCallback((error: Error) => {
    console.error('Voice mode error:', error);
    // Optionally show error to user
  }, []);

  // Préparer les données pour le mode vocal (TOUJOURS appelé, même si pas en mode vocal)
  // Ceci respecte les règles des hooks React qui doivent être appelés inconditionnellement
  const voiceMessages = useMemo(() => {
    return messages
      .filter(msg => msg.senderType === 'user' || msg.senderType === 'ai')
      .map(msg => {
        return {
          role: msg.senderType === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content,
          timestamp: msg.timestamp,
          // Use the database ID (msg.id) for editing, not the streaming messageId
          messageId: msg.id,
          metadata: msg.metadata,
        };
      });
  }, [messages]);

  const memoizedModelConfig = useMemo(() => ({
    ...(voiceModeModelConfig || {}),
    promptVariables: voiceModePromptVariables,
  } as any), [voiceModeModelConfig, voiceModePromptVariables]);

  const handleVoiceClose = useCallback(() => {
    setIsVoiceMode(false);
    onVoiceModeChange?.(false);
  }, [onVoiceModeChange]);

  // Check if ASK is closed
  const isAskClosed = ask && !ask.isActive;
  const participants = ask?.participants ?? [];
  const resolvedIsMultiUser = typeof isMultiUser === 'boolean' ? isMultiUser : participants.length > 1;

  if (!ask) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent>
          <p className="text-muted-foreground">Loading conversation...</p>
        </CardContent>
      </Card>
    );
  }

  if (isAskClosed) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center">
          <h3 className="text-lg font-semibold mb-2">This conversation is closed</h3>
          <p className="text-muted-foreground">This ASK session has ended and is no longer accepting responses.</p>
        </CardContent>
      </Card>
    );
  }

  // Show premium voice interface when voice mode is active
  if (isVoiceMode && voiceModeEnabled && voiceModeSystemPrompt) {
    console.log('[ChatComponent] 🎙️ Rendering PremiumVoiceInterface', {
      isVoiceMode,
      voiceModeEnabled,
      hasSystemPrompt: !!voiceModeSystemPrompt,
      askKey,
      messagesLength: voiceMessages.length
    });

    return (
      <PremiumVoiceInterface
        key={`voice-${askKey}`}
        askKey={askKey}
        askSessionId={ask?.askSessionId}
        systemPrompt={voiceModeSystemPrompt}
        userPrompt={voiceModeUserPrompt}
        modelConfig={memoizedModelConfig}
        onMessage={handleVoiceMessage}
        onError={handleVoiceError}
        onClose={handleVoiceClose}
        onEditMessage={onEditMessage}
        messages={voiceMessages}
        conversationPlan={conversationPlan}
      />
    );
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden max-w-full w-full min-w-0">
      <CardHeader className="pb-3 border-b border-border/40 min-w-0">
        <div className="flex items-center justify-between gap-3 min-w-0">
          <CardTitle className="text-base font-semibold truncate min-w-0">Conversation</CardTitle>
          {participants.length > 0 && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {participants.length} participant{participants.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardHeader>

      {/* Messages area */}
      <CardContent className="flex-1 flex flex-col overflow-hidden min-w-0 max-w-full">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 min-w-0 max-w-full">
          <AnimatePresence>
            {messages.map((message, index) => {
              const previous = index > 0 ? messages[index - 1] : null;
              const metadataSenderName = typeof message.metadata?.senderName === 'string' ? message.metadata.senderName : undefined;
              const effectiveSenderName = message.senderName ?? metadataSenderName ?? (
                message.senderType === 'ai'
                  ? 'Agent'
                  : message.senderType === 'system'
                    ? 'Système'
                    : currentParticipantName ?? 'Participant'
              );
              const currentSenderKey = `${message.senderType}-${message.senderId ?? effectiveSenderName ?? ''}`;
              const previousSenderKey = previous
                ? `${previous.senderType}-${previous.senderId ?? previous.senderName ?? (typeof previous.metadata?.senderName === 'string' ? previous.metadata.senderName : '')}`
                : null;
              const sameSender = previousSenderKey === currentSenderKey;
              const showSenderName = message.senderType === 'ai'
                ? !sameSender
                : message.senderType === 'system'
                  ? !sameSender
                  : resolvedIsMultiUser ? !sameSender : false;

              return (
                <MessageBubble
                  key={message.clientId ?? message.id}
                  message={{ ...message, senderName: effectiveSenderName }}
                  showSender={showSenderName}
                  senderLabel={effectiveSenderName}
                  conversationPlan={conversationPlan}
                  isEditing={editingMessageId === message.id}
                  editContent={editingMessageId === message.id ? editContent : ""}
                  onStartEdit={onEditMessage ? handleStartEdit : undefined}
                  onCancelEdit={handleCancelEdit}
                  onSubmitEdit={handleSubmitEdit}
                  onEditContentChange={setEditContent}
                  isSubmittingEdit={isSubmittingEdit}
                />
              );
            })}
            
          </AnimatePresence>
          
          {/* Interview completion celebration */}
          {allStepsCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, type: "spring", bounce: 0.4 }}
              className="mx-auto my-6 max-w-md"
            >
              <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 shadow-xl">
                {/* Confetti animation background */}
                <div className="absolute inset-0 opacity-20">
                  {[...Array(15)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute h-2 w-2 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500"
                      initial={{ 
                        x: Math.random() * 100 + '%',
                        y: -20,
                        rotate: 0,
                        scale: 0
                      }}
                      animate={{ 
                        y: '120%',
                        rotate: Math.random() * 360,
                        scale: [0, 1, 1, 0.8]
                      }}
                      transition={{
                        duration: 2 + Math.random() * 2,
                        delay: i * 0.1,
                        repeat: Infinity,
                        repeatDelay: 3
                      }}
                    />
                  ))}
                </div>
                
                <div className="relative z-10 text-center">
                  <motion.div
                    animate={{ 
                      rotate: [0, 10, -10, 10, 0],
                      scale: [1, 1.1, 1]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      repeatDelay: 2
                    }}
                    className="mb-4 text-6xl"
                  >
                    🎉
                  </motion.div>
                  
                  <h3 className="mb-2 text-2xl font-bold text-emerald-800">
                    Entretien terminé !
                  </h3>
                  
                  <p className="mb-4 text-sm text-emerald-700">
                    Merci pour votre participation et vos réponses détaillées.
                    Toutes les étapes ont été complétées avec succès !
                  </p>
                  
                  <motion.div
                    animate={{
                      boxShadow: [
                        '0 0 0 0 rgba(16, 185, 129, 0.4)',
                        '0 0 0 10px rgba(16, 185, 129, 0)',
                      ]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg"
                  >
                    <svg 
                      className="h-5 w-5" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2.5} 
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
                      />
                    </svg>
                    <span>Toutes les étapes complétées</span>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <AnimatePresence>
          {showAgentTyping && (
            <motion.div
              key="agent-typing-indicator"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="mb-3 flex items-center gap-2 pl-1 text-xs text-muted-foreground/80"
              aria-live="polite"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/30" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary/40" />
              </span>
              <span className="italic">Génération de la réponse en cours...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* File preview area */}
        {selectedFiles.length > 0 && !isVoiceMode && (
          <div className="border rounded-lg p-3 mb-3 bg-muted/50 min-w-0 max-w-full overflow-hidden">
            <div className="flex flex-wrap gap-2 min-w-0 max-w-full">
              {selectedFiles.map((fileUpload, index) => (
                <FilePreview
                  key={index}
                  fileUpload={fileUpload}
                  onRemove={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        {!isVoiceMode && (
          <div
            className={cn(
              "relative border rounded-lg p-2 sm:p-3 transition-colors min-w-0 max-w-full box-border",
              isDragOver && "border-primary bg-primary/5"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex items-end gap-2 min-w-0 max-w-full">
              <div className="flex-1 min-w-0">
                <Textarea
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Type your response..."
                  className="border-0 shadow-none resize-none min-h-[60px] focus-visible:ring-0 focus-visible:ring-offset-0 w-full max-w-full min-w-0 box-border text-base"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  onFocus={() => {
                    notifyTyping(true);
                    onReplyBoxFocusChange?.(true);
                    // Initiate conversation if no messages exist
                    if (messages.length === 0) {
                      onInitConversation?.();
                    }
                  }}
                  onBlur={() => {
                    notifyTyping(false);
                    onReplyBoxFocusChange?.(false);
                  }}
                />
              </div>
              
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* File upload button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 w-9"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                
                {/* Voice mode toggle button */}
                {voiceModeEnabled && voiceModeSystemPrompt && (
                  <Button
                    variant={isVoiceMode ? "default" : "ghost"}
                    size="icon"
                    onClick={() => {
                      const newVoiceMode = !isVoiceMode;
                      setIsVoiceMode(newVoiceMode);
                      onVoiceModeChange?.(newVoiceMode);
                    }}
                    className={cn("h-9 w-9", isVoiceMode && "bg-primary text-primary-foreground")}
                    title={isVoiceMode ? "Exit voice mode" : "Enter voice mode"}
                  >
                    <Radio className="h-4 w-4" />
                  </Button>
                )}
                
                {/* Audio recording button (only show if voice mode not enabled) */}
                {!voiceModeEnabled && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={cn("h-9 w-9", isRecording && "text-red-500")}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                )}
                
                {/* Send button */}
                <Button
                  onClick={handleSendMessage}
                  disabled={isLoading || (!inputValue.trim() && selectedFiles.length === 0)}
                  size="icon"
                  className="h-9 w-9"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-lg border-2 border-dashed border-primary">
                <p className="text-primary font-medium">Drop files here</p>
              </div>
            )}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,audio/*,.pdf,.doc,.docx,.txt"
          onChange={(e) => {
            if (e.target.files) {
              handleFileSelect(e.target.files);
            }
          }}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}

/**
 * Individual message bubble component
 */
function MessageBubble({
  message,
  showSender,
  senderLabel,
  conversationPlan,
  isEditing = false,
  editContent = "",
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onEditContentChange,
  isSubmittingEdit = false,
}: {
  message: Message;
  showSender: boolean;
  senderLabel?: string | null;
  conversationPlan?: ConversationPlan | null;
  isEditing?: boolean;
  editContent?: string;
  onStartEdit?: (messageId: string, currentContent: string) => void;
  onCancelEdit?: () => void;
  onSubmitEdit?: () => void;
  onEditContentChange?: (content: string) => void;
  isSubmittingEdit?: boolean;
}) {
  const isUser = message.senderType === 'user';
  const isSystem = message.senderType === 'system';
  const bubbleClass = isSystem
    ? 'bg-muted text-muted-foreground'
    : isUser
      ? 'bg-primary text-primary-foreground'
      : 'bg-muted text-foreground';

  // Check if this is an interim message (streaming update)
  const isInterim = message.metadata?.isInterim === true;
  
  // Detect and extract step completion marker (handles markdown formatting like **STEP_COMPLETE:**)
  // First, clean markdown formatting around STEP_COMPLETE
  const cleanedForDetection = message.content.replace(
    /(\*{1,2}|_{1,2})(STEP_COMPLETE:?\s*\w*)(\*{1,2}|_{1,2})/gi,
    '$2'
  );
  const stepCompleteMatch = cleanedForDetection.match(/STEP_COMPLETE:\s*(\w+)/i);
  const hasStepCompleteWithId = stepCompleteMatch !== null;
  // Also detect STEP_COMPLETE without ID (e.g., "STEP_COMPLETE:" or "**STEP_COMPLETE:**")
  const hasStepCompleteWithoutId = !hasStepCompleteWithId && /STEP_COMPLETE:?\s*(?!\w)/i.test(cleanedForDetection);
  const hasStepComplete = hasStepCompleteWithId || hasStepCompleteWithoutId;
  const completedStepId = stepCompleteMatch?.[1];

  // Find the completed step in conversation plan
  // If no step_id in marker, use the current active step
  const completedStep = hasStepComplete && conversationPlan
    ? completedStepId
      ? conversationPlan.plan_data.steps.find(step => step.id === completedStepId)
      : conversationPlan.plan_data.steps.find(step => step.status === 'active')
    : undefined;

  // Find step number (1-based index)
  const stepNumber = completedStep
    ? conversationPlan?.plan_data.steps.findIndex(step => step.id === completedStep.id)! + 1
    : undefined;

  // Remove the marker from display (handles all formats including markdown)
  const cleanContent = message.content
    .replace(/(\*{1,2}|_{1,2})?(STEP_COMPLETE:?\s*\w*)(\*{1,2}|_{1,2})?/gi, '')
    .trim();
  
  return (
    <motion.div
      initial={isInterim ? false : { opacity: 0, y: 20 }} // No animation for interim messages
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      layout={false} // Disable layout animations to prevent disappearing messages
      className={cn(
        'flex',
        isSystem ? 'justify-center' : isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] flex flex-col gap-1 min-w-0',
          isSystem ? 'items-center text-center' : isUser ? 'items-end' : 'items-start'
        )}
      >
        {showSender && senderLabel && (
          <span className={cn(
            'text-xs font-medium',
            isUser ? 'text-primary/90' : 'text-muted-foreground'
          )}>
            {senderLabel}
          </span>
        )}

        {/* Step completion indicator - shown BEFORE the message */}
        {hasStepComplete && !isUser && completedStep && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-3 rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 px-4 py-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <motion.div
                initial={{ rotate: 0, scale: 0 }}
                animate={{ rotate: 360, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 mt-0.5"
              >
                <svg
                  className="h-4 w-4 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-emerald-700">
                    Étape {stepNumber} complétée ! 🎯
                  </span>
                </div>
                <p className="text-sm font-medium text-emerald-800 mb-1">
                  {completedStep.title}
                </p>
                <p className="text-xs text-emerald-700/80 leading-relaxed">
                  {completedStep.objective}
                </p>
              </div>

              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="flex gap-0.5 flex-shrink-0 mt-1"
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}

        <div className="relative group">
          {/* Edit button for user messages - positioned outside the bubble */}
          {isUser && message.type === 'text' && onStartEdit && !isEditing && !isInterim && (
            <button
              onClick={() => onStartEdit(message.id, cleanContent)}
              className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground z-10"
              title="Modifier ce message"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <div className={cn('w-full rounded-lg px-4 py-2 break-words shadow-sm min-w-0 max-w-full overflow-hidden', bubbleClass)}>

          {/* Edit mode */}
          {isEditing && message.type === 'text' ? (
            <div className="flex flex-col gap-2">
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
                value={editContent}
                onChange={(e) => {
                  onEditContentChange?.(e.target.value);
                  // Auto-resize on content change
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                className="w-full min-h-[60px] p-2 rounded border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary overflow-hidden"
                autoFocus
                disabled={isSubmittingEdit}
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelEdit}
                  disabled={isSubmittingEdit}
                >
                  <X className="h-4 w-4 mr-1" />
                  Annuler
                </Button>
                <Button
                  size="sm"
                  onClick={onSubmitEdit}
                  disabled={isSubmittingEdit || !editContent.trim()}
                >
                  {isSubmittingEdit ? (
                    <>Sauvegarde...</>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Sauvegarder
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-white/80">
                Les messages suivants seront supprimés et la conversation reprendra depuis ce point.
              </p>
            </div>
          ) : (
            <>
              {message.type === 'text' && (
                <div className={cn(
                  "prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-pre:my-2 prose-headings:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1",
                  isUser && "[&>*]:text-white [&_p]:text-white [&_li]:text-white [&_strong]:text-white [&_em]:text-white"
                )}>
                  <TypewriterText
                    content={cleanContent}
                    isInterim={message.metadata?.isInterim === true}
                  />
                </div>
              )}
              {message.type === 'image' && (
                <img
                  src={message.content}
                  alt="Uploaded image"
                  className="max-w-full h-auto rounded"
                />
              )}
              {message.type === 'audio' && (
                <audio controls className="max-w-full">
                  <source src={message.content} type={message.metadata?.mimeType} />
                  Your browser does not support audio playback.
                </audio>
              )}
              {message.type === 'document' && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">
                    {message.metadata?.fileName}
                    {message.metadata?.fileSize && ` (${formatFileSize(message.metadata.fileSize)})`}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs opacity-70 mt-1">
                <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                {Boolean(message.metadata?.isEdited) && (
                  <span className="ml-2 italic">(modifié)</span>
                )}
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Typewriter component to smoothly display text without flickering
 * For interim messages: updates text directly in DOM without re-rendering container
 * For final messages: uses ReactMarkdown for proper formatting
 */
function TypewriterText({ 
  content, 
  isInterim = false 
}: { 
  content: string; 
  isInterim?: boolean;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);
  const isInterimRef = useRef(isInterim);
  const previousContentRef = useRef(content);

  // Update refs
  isInterimRef.current = isInterim;
  previousContentRef.current = content;

  useEffect(() => {
    if (isInterim && textRef.current) {
      // For interim messages: update text directly in DOM (no React re-render = no flickering)
      if (textRef.current.textContent !== content) {
        textRef.current.textContent = content;
      }
    }
  }, [content, isInterim]);

  // For interim messages: use a stable div that we update directly
  if (isInterim) {
    return (
      <div 
        ref={textRef}
        className="whitespace-pre-wrap break-words"
        style={{ minHeight: '1em' }}
      />
    );
  }

  // Final message - use ReactMarkdown for proper formatting
  return (
    <div ref={markdownRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            return match ? (
              <code className={className} {...props}>
                {children}
              </code>
            ) : (
              <code className="px-1 py-0.5 rounded bg-muted/50" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * File preview component for selected files
 */
function FilePreview({ 
  fileUpload, 
  onRemove 
}: { 
  fileUpload: FileUpload; 
  onRemove: () => void; 
}) {
  const getFileIcon = () => {
    switch (fileUpload.type) {
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'audio':
        return <Mic className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      default:
        return <Paperclip className="h-4 w-4" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="relative bg-background border rounded-lg p-2 flex items-center gap-2 max-w-xs"
    >
      {fileUpload.preview ? (
        <img 
          src={fileUpload.preview} 
          alt="Preview" 
          className="h-10 w-10 object-cover rounded"
        />
      ) : (
        <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
          {getFileIcon()}
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileUpload.file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(fileUpload.file.size)}
        </p>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-6 w-6 absolute -top-2 -right-2 bg-background border rounded-full"
      >
        <X className="h-3 w-3" />
      </Button>
    </motion.div>
  );
}
