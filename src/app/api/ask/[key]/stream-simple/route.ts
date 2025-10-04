import { NextRequest } from 'next/server';
import { callModelProviderStream } from '@/lib/ai/providers';
import { DEFAULT_MAX_OUTPUT_TOKENS } from '@/lib/ai/constants';
import type { AiModelConfig } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const { key } = params;
    const body = await request.json();
    const userMessage = body.message || 'Bonjour !';

    console.log('Simple streaming test for key:', key);
    console.log('User message:', userMessage);

    // Configuration directe du modèle Anthropic
    const modelConfig: AiModelConfig = {
      id: 'test-anthropic',
      code: 'anthropic-claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      baseUrl: 'https://api.anthropic.com/v1',
      additionalHeaders: {},
      isDefault: true,
      isFallback: false,
    };

    // Utiliser le message de l'utilisateur avec un prompt plus adapté
    const systemPrompt = `Tu es un facilitateur de conversation expérimenté. Ton rôle est d'aider les participants à explorer leurs défis, partager leurs expériences et générer des insights collectifs. 

Tu dois :
- Écouter activement et poser des questions pertinentes
- Aider à clarifier les problèmes et défis
- Encourager le partage d'expériences
- Faire émerger des solutions et insights
- Maintenir un ton professionnel mais accessible

Réponds de manière concise et engageante.`;
    const userPrompt = userMessage;

    console.log('Starting streaming with model:', modelConfig.provider);
    console.log('System prompt:', systemPrompt);
    console.log('User prompt:', userPrompt);

    // Créer la réponse en streaming
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullContent = '';
          
          console.log('Starting streaming...');
          
          for await (const chunk of callModelProviderStream(
            modelConfig,
            {
              systemPrompt,
              userPrompt,
              maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
            }
          )) {
            console.log('Received chunk:', chunk.content, 'done:', chunk.done);
            
            if (chunk.content) {
              fullContent += chunk.content;
              
              // Envoyer le chunk au client
              const data = JSON.stringify({
                type: 'chunk',
                content: chunk.content,
                done: chunk.done
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }

            if (chunk.done) {
              console.log('Streaming completed. Full content:', fullContent);
              
              // Envoyer le signal de fin
              controller.enqueue(encoder.encode(`data: {"type": "done"}\n\n`));
              controller.close();
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);
          
          const errorData = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in simple streaming endpoint:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
