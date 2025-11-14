import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { sanitizePromptVariables } from '@/lib/ai/agents';
import { parseErrorMessage } from '@/lib/utils';
import { extractTemplateVariables } from '@/lib/ai/templates';

interface AgentUpdatePayload {
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  userPrompt?: string;
  modelConfigId?: string | null;
  fallbackModelConfigId?: string | null;
  availableVariables?: string[];
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

    // Synchronize variables from prompts if systemPrompt or userPrompt are being updated
    let variables = sanitizePromptVariables(body.availableVariables);
    
    if (typeof body.systemPrompt === 'string' || typeof body.userPrompt === 'string') {
      // Get current agent to have both prompts for sync
      const { data: currentAgent } = await supabase
        .from('ai_agents')
        .select('system_prompt, user_prompt, available_variables')
        .eq('id', id)
        .maybeSingle();
      
      const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : (currentAgent?.system_prompt ?? '');
      const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt : (currentAgent?.user_prompt ?? '');
      
      // Extract variables from prompts
      const systemVars = extractTemplateVariables(systemPrompt);
      const userVars = extractTemplateVariables(userPrompt);
      const allDetectedVars = new Set([...systemVars, ...userVars]);
      
      // Merge with existing variables (from request or current agent)
      const existingVars = variables ?? (currentAgent?.available_variables ?? []);
      const merged = new Set([...existingVars, ...allDetectedVars]);
      variables = Array.from(merged);
    }
    
    if (variables) {
      updatePayload.available_variables = variables;
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
