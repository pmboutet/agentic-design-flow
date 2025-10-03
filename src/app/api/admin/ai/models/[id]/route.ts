import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const supabase = getAdminSupabaseClient();

    const payload: Record<string, unknown> = {};

    if (typeof body.code === 'string') {
      payload.code = body.code.trim();
    }
    if (typeof body.name === 'string') {
      payload.name = body.name.trim();
    }
    if (typeof body.provider === 'string') {
      payload.provider = body.provider.trim();
    }
    if (typeof body.model === 'string') {
      payload.model = body.model.trim();
    }
    if (typeof body.baseUrl === 'string' || body.baseUrl === null) {
      payload.base_url = body.baseUrl ?? null;
    }
    if (typeof body.apiKeyEnvVar === 'string') {
      payload.api_key_env_var = body.apiKeyEnvVar.trim();
    }
    if (body.additionalHeaders && typeof body.additionalHeaders === 'object') {
      payload.additional_headers = body.additionalHeaders;
    }
    if (typeof body.isDefault === 'boolean') {
      payload.is_default = body.isDefault;
    }
    if (typeof body.isFallback === 'boolean') {
      payload.is_fallback = body.isFallback;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid fields provided',
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_model_configs')
      .update(payload)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Modèle IA mis à jour',
    });
  } catch (error) {
    console.error('Unable to update AI model configuration', error);
    return NextResponse.json({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}
