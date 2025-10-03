import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { listModelConfigs } from '@/lib/ai/models';
import { parseErrorMessage } from '@/lib/utils';

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const models = await listModelConfigs(supabase);

    return NextResponse.json({
      success: true,
      data: models,
    });
  } catch (error) {
    console.error('Unable to load AI model configurations', error);
    return NextResponse.json({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminSupabaseClient();
    const body = await request.json();

    const payload: Record<string, unknown> = {
      code: typeof body.code === 'string' ? body.code.trim() : null,
      name: typeof body.name === 'string' ? body.name.trim() : null,
      provider: typeof body.provider === 'string' ? body.provider.trim() : null,
      model: typeof body.model === 'string' ? body.model.trim() : null,
      base_url: typeof body.baseUrl === 'string' ? body.baseUrl.trim() : null,
      api_key_env_var: typeof body.apiKeyEnvVar === 'string' ? body.apiKeyEnvVar.trim() : null,
      additional_headers: body.additionalHeaders && typeof body.additionalHeaders === 'object' ? body.additionalHeaders : null,
      is_default: Boolean(body.isDefault),
      is_fallback: Boolean(body.isFallback),
    };

    if (!payload.code || !payload.name || !payload.provider || !payload.model || !payload.api_key_env_var) {
      return NextResponse.json({
        success: false,
        error: 'code, name, provider, model et apiKeyEnvVar sont requis'
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_model_configs')
      .insert(payload)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Modèle IA créé',
    }, { status: 201 });
  } catch (error) {
    console.error('Unable to create AI model configuration', error);
    return NextResponse.json({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}
