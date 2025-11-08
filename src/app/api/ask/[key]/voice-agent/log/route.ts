import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createAgentLog, completeAgentLog } from '@/lib/ai/logs';
import { getChatAgentConfig, DEFAULT_CHAT_AGENT_SLUG } from '@/lib/ai/agent-config';
import { getAskSessionByKey } from '@/lib/asks';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';

const CHAT_AGENT_SLUG = DEFAULT_CHAT_AGENT_SLUG;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const body = await request.json().catch(() => ({}));
    const typedBody = body as {
      role: 'user' | 'agent';
      content: string;
      messageId?: string | null;
      logId?: string;
    };

    const { role, content, messageId, logId } = typedBody;

    if (!role || !content) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Missing role or content'
      }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // Get ASK session
    interface AskSessionRow {
      id: string;
      ask_key: string;
      question?: string | null;
      description?: string | null;
    }
    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(
      supabase,
      key,
      'id, ask_key, question, description'
    );

    if (askError || !askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK session not found'
      }, { status: 404 });
    }

    // Get agent config
    const agentConfig = await getChatAgentConfig(supabase, {
      ask_question: askRow.question || '',
      ask_description: askRow.description || '',
    });

    if (!agentConfig.modelConfig) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Failed to load agent configuration'
      }, { status: 500 });
    }

    if (role === 'user') {
      // Create a new log for user message
      const log = await createAgentLog(supabase, {
        agentId: agentConfig.agent?.id || null,
        askSessionId: askRow.id,
        messageId: messageId || null,
        interactionType: 'ask.chat.response.voice',
        requestPayload: {
          agentSlug: CHAT_AGENT_SLUG,
          modelConfigId: agentConfig.modelConfig.id,
          userMessage: content,
          role: 'user',
        },
      });

      return NextResponse.json<ApiResponse<{ logId: string }>>({
        success: true,
        data: {
          logId: log.id,
        },
      });
    } else {
      // Complete the log for agent response
      if (!logId) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Missing logId for agent response'
        }, { status: 400 });
      }

      await completeAgentLog(supabase, logId, {
        responsePayload: {
          agentMessage: content,
          role: 'agent',
        },
      });

      return NextResponse.json<ApiResponse>({
        success: true,
        data: { logId },
      });
    }

  } catch (error) {
    console.error('Error handling voice agent log:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

