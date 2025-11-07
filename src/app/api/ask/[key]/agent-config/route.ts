import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getAgentConfigForAsk } from '@/lib/ai/agent-config';
import { isValidAskKey } from '@/lib/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  
  if (!isValidAskKey(key)) {
    return NextResponse.json(
      { success: false, error: 'Invalid ask key format' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: askSession, error: askError } = await supabase
      .from('ask_sessions')
      .select('id')
      .eq('ask_key', key)
      .maybeSingle();

    if (askError) {
      throw new Error(`Failed to fetch ASK session: ${askError.message}`);
    }

    if (!askSession) {
      return NextResponse.json(
        { success: false, error: 'ASK session not found' },
        { status: 404 }
      );
    }

    const agentConfig = await getAgentConfigForAsk(supabase, askSession.id);

    return NextResponse.json({
      success: true,
      data: {
        systemPrompt: agentConfig.systemPrompt,
        userPrompt: agentConfig.userPrompt,
        modelConfig: agentConfig.modelConfig ? {
          id: agentConfig.modelConfig.id,
          provider: agentConfig.modelConfig.provider,
          model: agentConfig.modelConfig.model,
          deepgramSttModel: (agentConfig.modelConfig as any).deepgramSttModel,
          deepgramTtsModel: (agentConfig.modelConfig as any).deepgramTtsModel,
          deepgramLlmProvider: (agentConfig.modelConfig as any).deepgramLlmProvider,
          deepgramLlmModel: (agentConfig.modelConfig as any).deepgramLlmModel,
        } : null,
      },
    });
  } catch (error) {
    console.error('Error fetching agent config:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch agent configuration',
      },
      { status: 500 }
    );
  }
}

