import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { fetchAgentByIdOrSlug, buildChatAgentVariables, type PromptVariables, getAgentConfigForAsk } from '@/lib/ai/agent-config';
import { executeAgent } from '@/lib/ai/service';
import { renderTemplate } from '@/lib/ai/templates';
import { parseErrorMessage } from '@/lib/utils';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';
import { getAskSessionByKey, getOrCreateConversationThread, getMessagesForThread, getInsightsForThread } from '@/lib/asks';
import { getConversationPlanWithSteps } from '@/lib/ai/conversation-plan';
import { fetchInsightTypesForPrompt, fetchInsightsForSession } from '@/lib/insightQueries';
import { mapInsightRowToInsight } from '@/lib/insights';
import { buildEntityExtractionVariables } from '@/lib/graphRAG/extractEntities';
import {
  buildParticipantDisplayName,
  buildMessageSummary,
  buildParticipantSummary,
  fetchUsersByIds,
  type UserRow,
  type ParticipantRow,
  type MessageRow,
} from '@/lib/conversation-context';

interface TestRequest {
  askSessionId?: string;
  userId?: string;
  projectId?: string;
  challengeId?: string;
  insightId?: string; // For testing entity extraction agent
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
    const variables: Record<string, string | undefined> = {};

    if (body.askSessionId) {
      // Use THE SAME CODE as the streaming route to get real data
      // This ensures the test mode shows exactly what will be used in production
      
      // Fetch ASK session
      const { data: askRow, error: askError } = await supabase
        .from('ask_sessions')
        .select(`
          id,
          ask_key,
          question,
          description,
          system_prompt,
          project_id,
          challenge_id,
          conversation_mode
        `)
        .eq('id', body.askSessionId)
        .maybeSingle();

      if (askError) {
        throw new Error(`Failed to fetch ASK session: ${askError.message}`);
      }

      if (!askRow) {
        throw new Error('ASK session not found');
      }

      // Fetch participants
      const { data: participantRows } = await supabase
        .from('ask_participants')
        .select('id, user_id, participant_name, participant_email, role, is_spokesperson')
        .eq('ask_session_id', askRow.id)
        .order('joined_at', { ascending: true });

      const participantUserIds = (participantRows ?? [])
        .map(row => row.user_id)
        .filter((value): value is string => Boolean(value));

      let usersById: Record<string, any> = {};

      if (participantUserIds.length > 0) {
        const { data: userRows } = await supabase
          .from('profiles')
          .select('id, email, full_name, first_name, last_name')
          .in('id', participantUserIds);

        usersById = (userRows ?? []).reduce<Record<string, any>>((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {});
      }

      // Use unified buildParticipantSummary function for consistent participant mapping
      const participants = (participantRows ?? []).map((row, index) => {
        const user = row.user_id ? usersById[row.user_id] ?? null : null;
        return buildParticipantSummary(row as ParticipantRow, user, index);
      });

      // Get or create conversation thread
      const askConfig = {
        conversation_mode: askRow.conversation_mode ?? null,
      };

      // Use the userId from the request to get the correct thread
      const profileId = body.userId || null;

      const { thread: conversationThread } = await getOrCreateConversationThread(
        supabase,
        askRow.id,
        profileId,
        askConfig
      );

      // Get REAL messages (IMPORTANT: include plan_step_id for step variable support)
      let messageRows: MessageRow[] = [];
      if (conversationThread) {
        const { messages: threadMessages } = await getMessagesForThread(
          supabase,
          conversationThread.id
        );

        const { data: messagesWithoutThread } = await supabase
          .from('messages')
          .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id, plan_step_id')
          .eq('ask_session_id', askRow.id)
          .is('conversation_thread_id', null)
          .order('created_at', { ascending: true });

        const threadMessagesList = (threadMessages ?? []) as MessageRow[];
        const messagesWithoutThreadList = (messagesWithoutThread ?? []) as MessageRow[];
        messageRows = [...threadMessagesList, ...messagesWithoutThreadList].sort((a, b) => {
          const timeA = new Date(a.created_at ?? new Date().toISOString()).getTime();
          const timeB = new Date(b.created_at ?? new Date().toISOString()).getTime();
          return timeA - timeB;
        });
      } else {
        const { data } = await supabase
          .from('messages')
          .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, conversation_thread_id, plan_step_id')
          .eq('ask_session_id', askRow.id)
          .order('created_at', { ascending: true });
        messageRows = (data ?? []) as MessageRow[];
      }

      // Get user info for message senders
      const messageUserIds = (messageRows ?? [])
        .map(row => row.user_id)
        .filter((value): value is string => Boolean(value));

      const additionalUserIds = messageUserIds.filter(id => !usersById[id]);

      if (additionalUserIds.length > 0) {
        const { data: extraUsers } = await supabase
          .from('profiles')
          .select('id, email, full_name, first_name, last_name')
          .in('id', additionalUserIds);

        (extraUsers ?? []).forEach(user => {
          usersById[user.id] = user;
        });
      }

      // Build REAL messages using unified function for consistent mapping
      // CRITICAL: Uses buildMessageSummary to ensure planStepId is included for step variable support
      const messages = messageRows.map((row, index) => {
        const user = row.user_id ? usersById[row.user_id] ?? null : null;
        return buildMessageSummary(row, user, index);
      });

      // Fetch project data
      let projectData: any = null;
      if (askRow.project_id) {
        const { data } = await supabase
          .from('projects')
          .select('id, name, system_prompt')
          .eq('id', askRow.project_id)
          .maybeSingle();
        projectData = data ?? null;
      }

      // Fetch challenge data
      let challengeData: any = null;
      if (askRow.challenge_id) {
        const { data } = await supabase
          .from('challenges')
          .select('id, name, system_prompt')
          .eq('id', askRow.challenge_id)
          .maybeSingle();
        challengeData = data ?? null;
      }

      // Fetch insight types for prompt (same as production route)
      const insightTypes = await fetchInsightTypesForPrompt(supabase);

      // Fetch existing insights for the session (for insight detection agent)
      let existingInsights: any[] = [];
      if (conversationThread) {
        const { insights: threadInsights } = await getInsightsForThread(supabase, conversationThread.id);
        existingInsights = (threadInsights ?? []).map(mapInsightRowToInsight);
      } else {
        const insightRows = await fetchInsightsForSession(supabase, askRow.id);
        existingInsights = insightRows.map(mapInsightRowToInsight);
      }

      // Find the last AI response for latestAiResponse variable
      const lastAiMessage = [...messages].reverse().find(m => m.senderType === 'ai');

      // Fetch conversation plan if thread exists
      let conversationPlan = null;
      if (conversationThread) {
        conversationPlan = await getConversationPlanWithSteps(supabase, conversationThread.id);
        if (conversationPlan && conversationPlan.plan_data) {
          console.log('📋 Test mode: Loaded conversation plan with', conversationPlan.plan_data.steps.length, 'steps');
        }
      }

      // Build variables using THE SAME function as streaming route
      const agentVariables = buildConversationAgentVariables({
        ask: askRow,
        project: projectData,
        challenge: challengeData,
        messages,
        participants,
        conversationPlan,
        insightTypes,
        insights: existingInsights,
        latestAiResponse: lastAiMessage?.content ?? '',
      });

      // For ask-conversation-response agent, use getAgentConfigForAsk
      if (agent.slug === 'ask-conversation-response') {
        const agentConfig = await getAgentConfigForAsk(supabase, body.askSessionId, agentVariables);

        // Build resolved variables for highlighting
        const resolvedVariables: Record<string, string> = {};
        for (const [key, value] of Object.entries(agentVariables)) {
          if (value !== undefined && value !== null && String(value).trim().length > 0) {
            resolvedVariables[key] = String(value);
          }
        }

        return NextResponse.json({
          success: true,
          data: {
            systemPrompt: agentConfig.systemPrompt,
            userPrompt: agentConfig.userPrompt || '',
            resolvedVariables,
            metadata: {
              messagesCount: messages.length,
              participantsCount: participants.length,
              hasProject: !!projectData,
              hasChallenge: !!challengeData,
            },
          },
        });
      }

      // For other agents (like insight-detection), assign variables for rendering
      Object.assign(variables, agentVariables);

      // Build resolved variables for highlighting
      const resolvedVariables: Record<string, string> = {};
      for (const [key, value] of Object.entries(agentVariables)) {
        if (value !== undefined && value !== null && String(value).trim().length > 0) {
          resolvedVariables[key] = String(value);
        }
      }

      // Render templates with agent variables
      const systemPrompt = renderTemplate(agent.systemPrompt, agentVariables);
      const userPrompt = renderTemplate(agent.userPrompt, agentVariables);

      return NextResponse.json({
        success: true,
        data: {
          systemPrompt,
          userPrompt,
          resolvedVariables,
          metadata: {
            messagesCount: messages.length,
            participantsCount: participants.length,
            insightsCount: existingInsights.length,
            hasProject: !!projectData,
            hasChallenge: !!challengeData,
          },
        },
      });
    } else if (body.insightId) {
      // Build variables for entity extraction agent (insight-entity-extraction)
      // Uses THE SAME buildEntityExtractionVariables function as production code
      const { data: insight, error: insightError } = await supabase
        .from('insights')
        .select('id, content, summary, ask_session_id, challenge_id, insight_type_id, insight_types(name)')
        .eq('id', body.insightId)
        .maybeSingle();

      if (insightError) {
        throw new Error(`Failed to fetch insight: ${insightError.message}`);
      }

      if (!insight) {
        throw new Error('Insight not found');
      }

      // Get insight type name
      const insightTypeName = Array.isArray(insight.insight_types)
        ? insight.insight_types[0]?.name ?? 'unknown'
        : (insight.insight_types as any)?.name ?? 'unknown';

      // Build variables using the SAME function as production code
      const entityVariables = await buildEntityExtractionVariables(supabase, {
        content: insight.content ?? '',
        summary: insight.summary,
        type: insightTypeName,
        category: '', // Category is not stored directly, could be derived
        askSessionId: insight.ask_session_id,
        challengeId: insight.challenge_id,
      });

      // Build resolved variables for highlighting
      const resolvedVariables: Record<string, string> = {};
      for (const [key, value] of Object.entries(entityVariables)) {
        if (value !== undefined && value !== null && String(value).trim().length > 0) {
          resolvedVariables[key] = String(value);
        }
      }

      // Render templates with entity extraction variables
      const systemPrompt = renderTemplate(agent.systemPrompt, entityVariables);
      const userPrompt = renderTemplate(agent.userPrompt, entityVariables);

      return NextResponse.json({
        success: true,
        data: {
          systemPrompt,
          userPrompt,
          resolvedVariables,
          metadata: {
            insightId: insight.id,
            askSessionId: insight.ask_session_id,
            hasAskContext: !!entityVariables.ask_question,
            hasChallengeContext: !!entityVariables.challenge_name,
          },
        },
      });
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

    // Build resolved variables for highlighting (only non-empty values)
    const resolvedVariables: Record<string, string> = {};
    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined && value !== null && String(value).trim().length > 0) {
        resolvedVariables[key] = String(value);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        systemPrompt,
        userPrompt,
        resolvedVariables,
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

