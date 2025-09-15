"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, MessageSquare, Target } from "lucide-react";
import { ChatComponent } from "@/components/chat/ChatComponent";
import { ChallengeComponent } from "@/components/challenge/ChallengeComponent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionData, Ask, Message, Challenge, ApiResponse } from "@/types";
import { isValidAskKey, parseErrorMessage } from "@/lib/utils";

/**
 * Main application page that handles the ASK session interface
 * Displays chat on 1/3 of screen and challenges on 2/3
 * All data comes from external backend via webhooks
 */
export default function HomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [sessionData, setSessionData] = useState<SessionData>({
    askKey: '',
    ask: null,
    messages: [],
    challenges: [],
    isLoading: false,
    error: null
  });

  // Initialize session from URL parameters
  useEffect(() => {
    const key = searchParams.get('key');
    
    if (!key) {
      setSessionData(prev => ({
        ...prev,
        error: 'No ASK key provided in URL. Please use a valid ASK link.'
      }));
      return;
    }

    if (!isValidAskKey(key)) {
      setSessionData(prev => ({
        ...prev,
        error: 'Invalid ASK key format. Please check your link.'
      }));
      return;
    }

    setSessionData(prev => ({
      ...prev,
      askKey: key,
      isLoading: true,
      error: null
    }));

    // Load session data from external backend
    loadSessionData(key);
  }, [searchParams]);

  // Load session data from external backend via API
  const loadSessionData = async (key: string) => {
    try {
      // Call our API which will call the external backend
      const response = await fetch(`/api/ask/${key}`);
      const data: ApiResponse<{
        ask: Ask;
        messages: Message[];
        challenges: Challenge[];
      }> = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load session data from backend');
      }

      setSessionData(prev => ({
        ...prev,
        ask: data.data!.ask,
        messages: data.data!.messages,
        challenges: data.data!.challenges,
        isLoading: false,
        error: null
      }));

    } catch (error) {
      console.error('Error loading session data:', error);
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        error: parseErrorMessage(error)
      }));
    }
  };

  // Handle sending messages to external backend
  const handleSendMessage = async (
    content: string, 
    type: Message['type'] = 'text', 
    metadata?: Message['metadata']
  ) => {
    if (!sessionData.askKey) return;

    setSessionData(prev => ({ ...prev, isLoading: true }));

    try {
      // Send message to external backend via our API
      const response = await fetch(`/api/ask/${sessionData.askKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          type,
          metadata,
          timestamp: new Date().toISOString()
        })
      });

      const data: ApiResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to send message');
      }

      // Reload session data to get updated messages and potential new challenges
      await loadSessionData(sessionData.askKey);

    } catch (error) {
      console.error('Error sending message:', error);
      setSessionData(prev => ({
        ...prev,
        isLoading: false,
        error: parseErrorMessage(error)
      }));
    }
  };

  // Handle challenge updates (send to backend)
  const handleUpdateChallenge = async (challenge: Challenge) => {
    if (!sessionData.askKey) return;

    try {
      // Send challenge update to external backend
      const response = await fetch(`/api/challenges/${sessionData.askKey}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          askKey: sessionData.askKey,
          challenge,
          action: 'update_challenge',
          timestamp: new Date().toISOString()
        })
      });

      const data: ApiResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update challenge');
      }

      // Update challenge in local state optimistically
      setSessionData(prev => ({
        ...prev,
        challenges: prev.challenges.map(c => 
          c.id === challenge.id ? challenge : c
        )
      }));

    } catch (error) {
      console.error('Error updating challenge:', error);
      setSessionData(prev => ({
        ...prev,
        error: parseErrorMessage(error)
      }));
    }
  };

  // Retry loading session data
  const retryLoad = () => {
    if (sessionData.askKey) {
      loadSessionData(sessionData.askKey);
    }
  };

  // Clear error
  const clearError = () => {
    setSessionData(prev => ({ ...prev, error: null }));
  };

  // Render error state
  if (sessionData.error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{sessionData.error}</p>
            <div className="flex gap-2">
              {sessionData.askKey && (
                <Button onClick={retryLoad} variant="outline">
                  Retry
                </Button>
              )}
              <Button onClick={clearError} variant="ghost">
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render loading state
  if (sessionData.isLoading && !sessionData.ask) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">Loading session from backend...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold">Agentic Design Flow</h1>
              </div>
              {sessionData.askKey && (
                <div className="text-sm text-muted-foreground">
                  Session: {sessionData.askKey}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {sessionData.ask && (
                <div className="text-sm text-muted-foreground">
                  {sessionData.ask.isActive ? (
                    <span className="text-green-600 font-medium">Active</span>
                  ) : (
                    <span className="text-red-600 font-medium">Closed</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex h-[calc(100vh-80px)]">
        {/* Chat Section - 1/3 of screen */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-1/3 border-r bg-card"
        >
          <div className="h-full p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Conversation</h2>
            </div>
            
            <ChatComponent
              askKey={sessionData.askKey}
              ask={sessionData.ask}
              messages={sessionData.messages}
              onSendMessage={handleSendMessage}
              isLoading={sessionData.isLoading}
            />
          </div>
        </motion.div>

        {/* Challenge Section - 2/3 of screen */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 bg-background"
        >
          <div className="h-full">
            <div className="border-b bg-card p-6">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Challenges</h2>
                <span className="text-sm text-muted-foreground">
                  ({sessionData.challenges.length})
                </span>
              </div>
            </div>
            
            <ChallengeComponent
              challenges={sessionData.challenges}
              onUpdateChallenge={handleUpdateChallenge}
              askKey={sessionData.askKey}
            />
          </div>
        </motion.div>
      </main>

      {/* Error Toast */}
      {sessionData.error && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 right-6 max-w-md"
        >
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Error</p>
                  <p className="text-sm text-muted-foreground">{sessionData.error}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearError}
                  className="h-6 w-6 p-0"
                >
                  ×
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
