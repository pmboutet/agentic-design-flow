"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Paperclip, Mic, Image, FileText, X, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatComponentProps, Message, FileUpload } from "@/types";
import {
  cn,
  validateFileType,
  formatFileSize,
} from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { VoiceMode } from "./VoiceMode";
import { DeepgramMessageEvent } from "@/lib/ai/deepgram";

/**
 * Chat component that handles all conversation interactions
 * Supports text, audio, image, and document uploads
 * Displays time remaining and handles ASK status
 */
export function ChatComponent({
  askKey,
  ask,
  messages,
  onSendMessage,
  isLoading,
  onHumanTyping,
  currentParticipantName,
  isMultiUser,
  showAgentTyping,
  voiceModeEnabled = false,
  voiceModeSystemPrompt,
  voiceModeModelConfig,
  onVoiceMessage,
  onReplyBoxFocusChange,
}: ChatComponentProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileUpload[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  // Handle voice mode messages
  const handleVoiceMessage = (message: DeepgramMessageEvent) => {
    if (onVoiceMessage) {
      onVoiceMessage(message.role, message.content);
    }
  };

  const handleVoiceError = (error: Error) => {
    console.error('Voice mode error:', error);
    // Optionally show error to user
  };

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

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Conversation</CardTitle>
          {participants.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {participants.length} participant{participants.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardHeader>

      {/* Messages area */}
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
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
                />
              );
            })}
            
          </AnimatePresence>
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
              <span className="italic">L'agent est en train de répondre</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* File preview area */}
        {selectedFiles.length > 0 && !isVoiceMode && (
          <div className="border rounded-lg p-3 mb-3 bg-muted/50">
            <div className="flex flex-wrap gap-2">
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

        {/* Voice Mode */}
        {isVoiceMode && voiceModeEnabled && voiceModeSystemPrompt && (
          <div className="mb-3">
            <VoiceMode
              askKey={askKey}
              askSessionId={ask?.askSessionId}
              systemPrompt={voiceModeSystemPrompt}
              modelConfig={voiceModeModelConfig}
              onMessage={handleVoiceMessage}
              onError={handleVoiceError}
              onClose={() => setIsVoiceMode(false)}
            />
          </div>
        )}

        {/* Input area */}
        {!isVoiceMode && (
          <div 
            className={cn(
              "relative border rounded-lg p-3 transition-colors",
              isDragOver && "border-primary bg-primary/5"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Textarea
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Type your response..."
                  className="border-0 shadow-none resize-none min-h-[60px] focus-visible:ring-0"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  onFocus={() => {
                    notifyTyping(true);
                    onReplyBoxFocusChange?.(true);
                  }}
                  onBlur={() => {
                    notifyTyping(false);
                    onReplyBoxFocusChange?.(false);
                  }}
                />
              </div>
              
              <div className="flex items-center gap-1">
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
                    onClick={() => setIsVoiceMode(!isVoiceMode)}
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
}: {
  message: Message;
  showSender: boolean;
  senderLabel?: string | null;
}) {
  const isUser = message.senderType === 'user';
  const isSystem = message.senderType === 'system';
  const bubbleClass = isSystem
    ? 'bg-muted text-muted-foreground'
    : isUser
      ? 'bg-primary text-primary-foreground'
      : 'bg-muted text-foreground';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        'flex',
        isSystem ? 'justify-center' : isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] flex flex-col gap-1',
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
        <div className={cn('w-full rounded-lg px-4 py-2 break-words shadow-sm', bubbleClass)}>
          {message.type === 'text' && (
            <div className={cn(
              "prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-pre:my-2 prose-headings:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1",
              isUser && "[&>*]:text-white [&_p]:text-white [&_li]:text-white [&_strong]:text-white [&_em]:text-white"
            )}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // Customize link rendering to open in new tab
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                  // Customize code blocks
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
                {message.content}
              </ReactMarkdown>
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

          <div className="text-xs opacity-70 mt-1">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </motion.div>
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
