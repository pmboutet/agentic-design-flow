import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';

interface AgentUpdatePayload {
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  userPrompt?: string;
  modelConfigId?: string | null;
  fallbackModelConfigId?: string | null;
  availableVariables?: string[];
}

function sanitizeVariables(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  return values
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(value => value.length > 0);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
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

    const variables = sanitizeVariables(body.availableVariables);
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
