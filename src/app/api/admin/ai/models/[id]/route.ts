import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { parseErrorMessage } from '@/lib/utils';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    // Deepgram-specific fields
    if (typeof body.deepgramVoiceAgentModel === 'string' || body.deepgramVoiceAgentModel === null) {
      payload.deepgram_voice_agent_model = body.deepgramVoiceAgentModel?.trim() || null;
    }
    if (typeof body.deepgramSttModel === 'string' || body.deepgramSttModel === null) {
      payload.deepgram_stt_model = body.deepgramSttModel?.trim() || null;
    }
    if (typeof body.deepgramTtsModel === 'string' || body.deepgramTtsModel === null) {
      payload.deepgram_tts_model = body.deepgramTtsModel?.trim() || null;
    }
    if (typeof body.deepgramLlmProvider === 'string' || body.deepgramLlmProvider === null) {
      payload.deepgram_llm_provider = body.deepgramLlmProvider?.trim() || null;
    }
    // ElevenLabs-specific fields
    if (body.elevenLabsVoiceId !== undefined) {
      if (body.elevenLabsVoiceId === null) {
        payload.elevenlabs_voice_id = null;
      } else if (typeof body.elevenLabsVoiceId === 'string') {
        payload.elevenlabs_voice_id = body.elevenLabsVoiceId.trim() || null;
      }
    }
    if (body.elevenLabsModelId !== undefined) {
      if (body.elevenLabsModelId === null) {
        payload.elevenlabs_model_id = null;
      } else if (typeof body.elevenLabsModelId === 'string') {
        payload.elevenlabs_model_id = body.elevenLabsModelId.trim() || null;
      }
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
