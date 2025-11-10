import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { executeAgent } from '@/lib/ai/service';
import { getChatAgentConfig, DEFAULT_CHAT_AGENT_SLUG } from '@/lib/ai/agent-config';
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

    // Get agent config with voice model
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

    // Check if model config has voice agent provider
    const modelConfig = agentConfig.modelConfig;
    const voiceAgentProvider = (modelConfig as any).voiceAgentProvider || modelConfig.provider;
    if (voiceAgentProvider !== 'deepgram-voice-agent' && voiceAgentProvider !== 'speechmatics-voice-agent') {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Voice agent not configured for this model'
      }, { status: 400 });
    }

    // Build prompt variables (minimal for voice agent init)
    const promptVariables = {
      ask_question: askRow.question || '',
      ask_description: askRow.description || '',
    };

    // Execute agent to get voice agent response
    const result = await executeAgent({
      supabase,
      agentSlug: CHAT_AGENT_SLUG,
      askSessionId: askRow.id,
      interactionType: CHAT_INTERACTION_TYPE,
      variables: {
        ask_question: askRow.question || '',
        ask_description: askRow.description || '',
      },
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

