import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { fetchAgentByIdOrSlug } from '@/lib/ai/agent-config';
import { renderTemplate } from '@/lib/ai/templates';
import { parseErrorMessage } from '@/lib/utils';

interface TestRequest {
  askSessionId?: string;
  projectId?: string;
  challengeId?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as TestRequest;
    const supabase = getAdminSupabaseClient();

    // Fetch agent
    const agent = await fetchAgentByIdOrSlug(supabase, { id, slug: null });
    if (!agent) {
      return NextResponse.json({
        success: false,
        error: 'Agent not found',
      }, { status: 404 });
    }

    // Build variables based on context
    const variables: Record<string, string> = {};

    if (body.askSessionId) {
      // Build variables for ASK context
      const { data: askSession, error: askError } = await supabase
        .from('ask_sessions')
        .select(`
          id,
          ask_key,
          question,
          description,
          system_prompt,
          project_id,
          challenge_id,
          projects(id, name, system_prompt),
          challenges(id, name, system_prompt)
        `)
        .eq('id', body.askSessionId)
        .maybeSingle();

      if (askError) {
        throw new Error(`Failed to fetch ASK session: ${askError.message}`);
      }

      if (askSession) {
        variables.ask_key = askSession.ask_key ?? askSession.id;
        variables.ask_question = askSession.question ?? '';
        variables.ask_description = askSession.description ?? '';
        variables.system_prompt_ask = askSession.system_prompt ?? '';
        
        const project = Array.isArray(askSession.projects) ? askSession.projects[0] : askSession.projects;
        const challenge = Array.isArray(askSession.challenges) ? askSession.challenges[0] : askSession.challenges;
        
        variables.system_prompt_project = project?.system_prompt ?? '';
        variables.system_prompt_challenge = challenge?.system_prompt ?? '';
        
        // Mock some common ASK variables
        variables.message_history = 'Message 1: Test message\nMessage 2: Another test message';
        variables.latest_user_message = 'Test user message';
        variables.latest_ai_response = 'Test AI response';
        variables.participant_name = 'Test User';
        variables.participants = 'Test User (Participant), Another User (Observer)';
        variables.existing_insights_json = JSON.stringify([]);
      }
    } else if (body.challengeId) {
      // Build variables for challenge context (ask-generator or challenge-builder)
      const { data: challenge, error: challengeError } = await supabase
        .from('challenges')
        .select('id, name, description, status, project_id, projects(id, name, system_prompt)')
        .eq('id', body.challengeId)
        .maybeSingle();

      if (challengeError) {
        throw new Error(`Failed to fetch challenge: ${challengeError.message}`);
      }

      if (challenge) {
        const project = Array.isArray(challenge.projects) ? challenge.projects[0] : challenge.projects;
        
        variables.challenge_id = challenge.id;
        variables.challenge_title = challenge.name ?? '';
        variables.challenge_description = challenge.description ?? '';
        variables.challenge_status = challenge.status ?? '';
        variables.challenge_impact = '';
        variables.project_name = project?.name ?? '';
        variables.system_prompt_project = project?.system_prompt ?? '';
        variables.system_prompt_challenge = '';
        
        // Mock challenge context variables
        variables.challenge_context_json = JSON.stringify({
          project: { id: challenge.project_id, name: project?.name },
          challenge: { id: challenge.id, title: challenge.name, description: challenge.description },
        });
        variables.insights_json = JSON.stringify([]);
        variables.existing_asks_json = JSON.stringify([]);
        variables.current_date = new Date().toISOString();
      }
    } else if (body.projectId) {
      // Build variables for project context
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name, system_prompt')
        .eq('id', body.projectId)
        .maybeSingle();

      if (projectError) {
        throw new Error(`Failed to fetch project: ${projectError.message}`);
      }

      if (project) {
        variables.project_name = project.name ?? '';
        variables.system_prompt_project = project.system_prompt ?? '';
      }
    }

    // Render templates with variables
    const systemPrompt = renderTemplate(agent.systemPrompt, variables);
    const userPrompt = renderTemplate(agent.userPrompt, variables);

    return NextResponse.json({
      success: true,
      data: {
        systemPrompt,
        userPrompt,
        variables,
      },
    });
  } catch (error) {
    console.error('Error testing agent', error);
    return NextResponse.json({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

