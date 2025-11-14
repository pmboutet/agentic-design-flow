import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { executeAgent } from '@/lib/ai/service';
import { buildChatAgentVariables, DEFAULT_CHAT_AGENT_SLUG, type PromptVariables } from '@/lib/ai/agent-config';
import { getAskSessionByKey } from '@/lib/asks';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';

const CHAT_AGENT_SLUG = DEFAULT_CHAT_AGENT_SLUG;
const CHAT_INTERACTION_TYPE = 'ask.chat.response.voice';

interface AskSessionRow {
  id: string;
  ask_key: string;
  question: string;
  description?: string | null;
  status?: string | null;
  system_prompt?: string | null;
  project_id?: string | null;
  challenge_id?: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const supabase = await createServerSupabaseClient();

    // Get ASK session
    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow>(
      supabase,
      key,
      'id, ask_key, question, description, status, system_prompt, project_id, challenge_id'
    );

    if (askError || !askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK session not found'
      }, { status: 404 });
    }

    // Build complete variables including system_prompt_* from database
    // This ensures consistency with other modes (text, streaming)
    const baseVariables = await buildChatAgentVariables(supabase, askRow.id);
    
    // For voice agent init, we need minimal variables but still include system_prompt_*
    // The full conversation context will be added later when messages are sent
    const promptVariables: PromptVariables = {
      ...baseVariables,
      // Additional variables can be added here if needed for voice init
    };

    // Execute agent to get voice agent response
    // executeAgent will use getAgentConfigForAsk internally which handles system_prompt_* correctly
    const result = await executeAgent({
      supabase,
      agentSlug: CHAT_AGENT_SLUG,
      askSessionId: askRow.id,
      interactionType: CHAT_INTERACTION_TYPE,
      variables: promptVariables,
    });

    // Check if result is a voice agent response
    if ('voiceAgent' in result) {
      return NextResponse.json<ApiResponse<{ logId: string }>>({
        success: true,
        data: {
          logId: result.logId,
        },
      });
    }

    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Voice agent initialization failed'
    }, { status: 500 });

  } catch (error) {
    console.error('Error initializing voice agent:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}

