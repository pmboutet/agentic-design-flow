import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { AiAgentRow, listAgents, mapAgentRow, sanitizePromptVariables } from '@/lib/ai/agents';
import { PROMPT_VARIABLES } from '@/lib/ai/constants';

interface AgentCreatePayload {
  slug?: string;
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  userPrompt?: string;
  modelConfigId?: string | null;
  fallbackModelConfigId?: string | null;
  availableVariables?: string[];
  voice?: boolean;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const agents = await listAgents(supabase, { includeModels: true });

    return NextResponse.json({
      success: true,
      data: {
        agents,
        variables: PROMPT_VARIABLES,
      },
    });
  } catch (error) {
    console.error('Unable to list AI agents', error);
    return NextResponse.json({
      success: false,
      error: (error instanceof Error ? error.message : 'Unexpected error while loading AI agents'),
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AgentCreatePayload;

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : '';
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt : '';

    if (!name) {
      return NextResponse.json({
        success: false,
        error: 'Le nom de l\'agent est requis.',
      }, { status: 400 });
    }

    if (!systemPrompt) {
      return NextResponse.json({
        success: false,
        error: 'Un system prompt est requis pour créer un agent.',
      }, { status: 400 });
    }

    if (!userPrompt) {
      return NextResponse.json({
        success: false,
        error: 'Un user prompt est requis pour créer un agent.',
      }, { status: 400 });
    }

    const explicitSlug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const slugSource = explicitSlug || name;
    const slug = slugify(slugSource);

    if (!slug) {
      return NextResponse.json({
        success: false,
        error: 'Impossible de générer un slug pour cet agent. Merci de renseigner un identifiant valide.',
      }, { status: 400 });
    }

    const supabase = getAdminSupabaseClient();

    const variables = sanitizePromptVariables(body.availableVariables) ?? [];

    const insertPayload: AiAgentRow = {
      id: randomUUID(),
      slug,
      name,
      description: typeof body.description === 'string' ? body.description : null,
      model_config_id: body.modelConfigId ?? null,
      fallback_model_config_id: body.fallbackModelConfigId ?? null,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      available_variables: variables,
      voice: typeof body.voice === 'boolean' ? body.voice : false,
      metadata: null,
    } as AiAgentRow;

    const { data, error } = await supabase
      .from('ai_agents')
      .insert({
        id: insertPayload.id,
        slug: insertPayload.slug,
        name: insertPayload.name,
        description: insertPayload.description ?? null,
        model_config_id: insertPayload.model_config_id ?? null,
        fallback_model_config_id: insertPayload.fallback_model_config_id ?? null,
        system_prompt: insertPayload.system_prompt,
        user_prompt: insertPayload.user_prompt,
        available_variables: insertPayload.available_variables ?? [],
        voice: insertPayload.voice ?? false,
        metadata: insertPayload.metadata ?? null,
      })
      .select('*')
      .maybeSingle<AiAgentRow>();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('La création de l\'agent a échoué.');
    }

    return NextResponse.json({
      success: true,
      data: mapAgentRow(data),
      message: 'Agent créé avec succès',
    }, { status: 201 });
  } catch (error) {
    console.error('Unable to create AI agent', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inattendue lors de la création de l\'agent',
    }, { status: 500 });
  }
}
