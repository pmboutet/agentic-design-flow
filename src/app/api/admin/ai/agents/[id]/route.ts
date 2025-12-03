import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';
import { extractTemplateVariables } from '@/lib/ai/templates';
import { mapAgentRow, type AiAgentRow } from '@/lib/ai/agents';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getAdminSupabaseClient();

    // Try to fetch by ID first, then by slug
    let agent: AiAgentRow | null = null;

    // Check if it looks like a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (isUuid) {
      const { data } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('id', id)
        .maybeSingle<AiAgentRow>();
      agent = data;
    }

    // If not found by ID, try by slug
    if (!agent) {
      const { data } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('slug', id)
        .maybeSingle<AiAgentRow>();
      agent = data;
    }

    if (!agent) {
      return NextResponse.json({
        success: false,
        error: 'Agent not found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: mapAgentRow(agent),
    });
  } catch (error) {
    console.error('Unable to fetch AI agent', error);
    return NextResponse.json({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

interface AgentUpdatePayload {
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  userPrompt?: string;
  modelConfigId?: string | null;
  fallbackModelConfigId?: string | null;
  voice?: boolean;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as AgentUpdatePayload;

    const supabase = getAdminSupabaseClient();

    const updatePayload: Record<string, unknown> = {};

    if (typeof body.name === 'string' && body.name.trim().length > 0) {
      updatePayload.name = body.name.trim();
    }
    if (typeof body.description === 'string' || body.description === null) {
      updatePayload.description = body.description ?? null;
    }
    if (typeof body.systemPrompt === 'string') {
      updatePayload.system_prompt = body.systemPrompt;
    }
    if (typeof body.userPrompt === 'string') {
      updatePayload.user_prompt = body.userPrompt;
    }
    if (body.modelConfigId === null || typeof body.modelConfigId === 'string') {
      updatePayload.model_config_id = body.modelConfigId ?? null;
    }
    if (body.fallbackModelConfigId === null || typeof body.fallbackModelConfigId === 'string') {
      updatePayload.fallback_model_config_id = body.fallbackModelConfigId ?? null;
    }
    if (typeof body.voice === 'boolean') {
      updatePayload.voice = body.voice;
    }

    // Vibe Coding: Auto-extract variables from templates if prompts are being updated
    if (typeof body.systemPrompt === 'string' || typeof body.userPrompt === 'string') {
      // Get current agent to have both prompts for extraction
      const { data: currentAgent } = await supabase
        .from('ai_agents')
        .select('system_prompt, user_prompt')
        .eq('id', id)
        .maybeSingle();
      
      const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : (currentAgent?.system_prompt ?? '');
      const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt : (currentAgent?.user_prompt ?? '');
      
      // Auto-extract variables from both prompts
      const systemVars = extractTemplateVariables(systemPrompt);
      const userVars = extractTemplateVariables(userPrompt);
      const detectedVariables = Array.from(new Set([...systemVars, ...userVars]));
      
      updatePayload.available_variables = detectedVariables;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid fields provided for update',
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_agents')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Agent mis à jour',
    });
  } catch (error) {
    console.error('Unable to update AI agent', error);
    return NextResponse.json({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}
