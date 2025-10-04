"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestStreamingPage() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testStreaming = async () => {
    setIsStreaming(true);
    setStreamingMessage('');
    addLog('Démarrage du test de streaming...');

    try {
      const response = await fetch('/api/ask/test-key/stream-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      addLog(`Réponse reçue: ${response.status}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data.trim()) {
              try {
                const parsed = JSON.parse(data);
                addLog(`Données reçues: ${JSON.stringify(parsed)}`);
                
                if (parsed.type === 'chunk' && parsed.content) {
                  setStreamingMessage(prev => prev + parsed.content);
                } else if (parsed.type === 'done') {
                  addLog('Streaming terminé');
                  setIsStreaming(false);
                  return;
                } else if (parsed.type === 'error') {
                  addLog(`Erreur: ${parsed.error}`);
                  setIsStreaming(false);
                  return;
                }
              } catch (error) {
                addLog(`Erreur parsing: ${error}`);
              }
            }
          }
        }
      }
    } catch (error) {
      addLog(`Erreur: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsStreaming(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Test de Streaming AI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={testStreaming} 
              disabled={isStreaming}
              className="w-full"
            >
              {isStreaming ? 'Streaming en cours...' : 'Tester le Streaming'}
            </Button>

            {streamingMessage && (
              <div className="border rounded-lg p-4 bg-muted">
                <h3 className="font-semibold mb-2">Message en streaming:</h3>
                <p className="whitespace-pre-wrap">{streamingMessage}</p>
                {isStreaming && <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse" />}
              </div>
            )}

            <div className="border rounded-lg p-4 bg-muted">
              <h3 className="font-semibold mb-2">Logs:</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {logs.map((log, index) => (
                  <div key={index} className="text-sm font-mono text-muted-foreground">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
