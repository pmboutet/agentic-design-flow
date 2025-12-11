import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getAgentConfigForAsk, type PromptVariables } from '@/lib/ai/agent-config';
import { isValidAskKey } from '@/lib/utils';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';
import { getConversationPlanWithSteps } from '@/lib/ai/conversation-plan';
import {
  buildParticipantDisplayName,
  buildMessageSummary,
  buildParticipantSummary,
  type AskSessionRow,
  type UserRow,
  type ParticipantRow,
  type ProjectRow,
  type ChallengeRow,
  type MessageRow,
} from '@/lib/conversation-context';

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

    // Check if user is accessing via invite token
    // Use request.nextUrl instead of new URL(request.url) for Next.js compatibility
    const token = request.nextUrl.searchParams.get('token');

    console.log(`[agent-config] Token from URL: ${token ? token.substring(0, 8) + '...' : 'null'}`);
    console.log(`[agent-config] Full URL: ${request.url}`);
    console.log(`[agent-config] NextURL: ${request.nextUrl.toString()}`);

    let askSession: AskSessionRow | null = null;

    if (token) {
      console.log(`[agent-config] Using token-based RPC access`);
      // Use token-based access function that bypasses RLS securely
      const { data, error: tokenError } = await supabase
        .rpc('get_ask_session_by_token', { p_token: token })
        .maybeSingle<{
          ask_session_id: string;
          ask_key: string;
          question: string;
          description: string | null;
          project_id: string | null;
          challenge_id: string | null;
        }>();

      if (tokenError) {
        console.error(`[agent-config] RPC error:`, tokenError);
        throw new Error(`Failed to fetch ASK session by token: ${tokenError.message}`);
      }

      console.log(`[agent-config] RPC result: data=${!!data}, error=${!!tokenError}`);

      // Map the returned columns to our interface
      if (data) {
        askSession = {
          id: data.ask_session_id,
          ask_key: data.ask_key,
          question: data.question,
          description: data.description,
          project_id: data.project_id,
          challenge_id: data.challenge_id,
          system_prompt: null, // Not returned by token function, will need to add if needed
        };
      }
    } else {
      console.log(`[agent-config] No token, using standard RLS access`);
      // Standard authenticated access via RLS
      const { data, error: askError } = await supabase
        .from('ask_sessions')
        .select('id, ask_key, question, description, project_id, challenge_id, system_prompt')
        .eq('ask_key', key)
        .maybeSingle<AskSessionRow>();

      if (askError) {
        throw new Error(`Failed to fetch ASK session: ${askError.message}`);
      }

      askSession = data;
    }

    if (!askSession) {
      return NextResponse.json(
        { success: false, error: 'ASK session not found' },
        { status: 404 }
      );
    }

    // Fetch participants - use RPC if token is present, otherwise use direct table access
    let participantRows: any[] = [];
    if (token) {
      // Use token-based RPC function that bypasses RLS
      const { data: rpcParticipants, error: participantError } = await supabase
        .rpc('get_ask_participants_by_token', { p_token: token });
      
      if (participantError) {
        console.error('Error fetching participants via RPC:', participantError);
      } else {
        participantRows = (rpcParticipants ?? []).map((row: any) => ({
          id: row.participant_id,
          user_id: row.user_id,
          participant_name: row.participant_name,
          participant_email: row.participant_email,
          role: row.role,
          is_spokesperson: row.is_spokesperson,
          joined_at: row.joined_at,
        }));
      }
    } else {
      // Standard authenticated access via RLS
      const { data, error: participantError } = await supabase
        .from('ask_participants')
        .select('*')
        .eq('ask_session_id', askSession.id)
        .order('joined_at', { ascending: true });

      if (participantError) {
        console.error('Error fetching participants:', participantError);
      } else {
        participantRows = data ?? [];
      }
    }

    const participantUserIds = (participantRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    let usersById: Record<string, UserRow> = {};

    if (participantUserIds.length > 0) {
      const { data: userRows, error: userError } = await supabase
        .from('profiles')
        .select('id, email, full_name, first_name, last_name')
        .in('id', participantUserIds);

      if (userError) {
        // If token-based access, RLS might block profile access - this is OK, we'll use participant_name from RPC
        if (token) {
          console.warn('Could not fetch user profiles (RLS restriction with token), using participant_name from RPC:', userError.message);
        } else {
          console.error('Error fetching users:', userError);
        }
      } else {
        usersById = (userRows ?? []).reduce<Record<string, UserRow>>((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {});
      }
    }

    const participants = (participantRows ?? []).map((row, index) => {
      const user = row.user_id ? usersById[row.user_id] ?? null : null;
      return {
        id: row.id,
        name: buildParticipantDisplayName(row, user, index),
        email: row.participant_email ?? user?.email ?? null,
        role: row.role ?? null,
        description: row.description ?? null,
        isSpokesperson: Boolean(row.is_spokesperson),
        isActive: true,
      };
    });

    // Fetch messages - use RPC if token is present, otherwise use direct table access
    let messageRows: any[] = [];
    if (token) {
      // Use token-based RPC function that bypasses RLS
      const { data: rpcMessages, error: messageError } = await supabase
        .rpc('get_ask_messages_by_token', { p_token: token });
      
      if (messageError) {
        console.error('Error fetching messages via RPC:', messageError);
      } else {
        messageRows = (rpcMessages ?? []).map((row: any) => ({
          id: row.message_id,
          ask_session_id: askSession.id,
          user_id: row.sender_id,
          sender_type: row.sender_type,
          content: row.content,
          message_type: row.type,
          metadata: row.metadata,
          created_at: row.created_at,
          sender_name: row.sender_name, // Include sender_name from RPC
        }));
      }
    } else {
      // Standard authenticated access via RLS
      const { data, error: messageError } = await supabase
        .from('messages')
        .select('id, ask_session_id, user_id, sender_type, content, message_type, metadata, created_at, plan_step_id')
        .eq('ask_session_id', askSession.id)
        .order('created_at', { ascending: true });

      if (messageError) {
        console.error('Error fetching messages:', messageError);
      } else {
        messageRows = data ?? [];
      }
    }

    const messageUserIds = (messageRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    const additionalUserIds = messageUserIds.filter(id => !usersById[id]);

    if (additionalUserIds.length > 0) {
      const { data: extraUsers, error: extraUsersError } = await supabase
        .from('profiles')
        .select('id, email, full_name, first_name, last_name')
        .in('id', additionalUserIds);

      if (extraUsersError) {
        // If token-based access, RLS might block profile access - this is OK, sender_name is already in RPC response
        if (token) {
          console.warn('Could not fetch additional user profiles (RLS restriction with token), using sender_name from RPC:', extraUsersError.message);
        } else {
          console.error('Error fetching additional users:', extraUsersError);
        }
      } else {
        (extraUsers ?? []).forEach(user => {
          usersById[user.id] = user;
        });
      }
    }

    // Format messages using unified buildMessageSummary for consistent mapping
    // Note: For token-based access, the RPC function may provide sender_name directly
    const messages = (messageRows ?? []).map((row, index) => {
      const user = row.user_id ? usersById[row.user_id] ?? null : null;

      // For token-based access, sender_name is already computed by RPC function
      // Otherwise, use the unified buildMessageSummary function
      if (token && (row as any).sender_name) {
        return {
          id: row.id,
          senderType: row.sender_type ?? 'user',
          senderName: (row as any).sender_name,
          content: row.content,
          timestamp: row.created_at ?? new Date().toISOString(),
          planStepId: row.plan_step_id ?? null,
        };
      }

      return buildMessageSummary(row as MessageRow, user, index);
    });

    // Fetch conversation plan with steps (for step-aware prompt variables)
    let conversationPlan = null;
    try {
      // Get conversation thread for this ask session
      const { data: threadData } = await supabase
        .from('conversation_threads')
        .select('id')
        .eq('ask_session_id', askSession.id)
        .maybeSingle();

      if (threadData?.id) {
        conversationPlan = await getConversationPlanWithSteps(supabase, threadData.id);
      }
    } catch (planError) {
      console.warn('[agent-config] Could not load conversation plan:', planError);
    }

    // Fetch project and challenge data
    let projectData: ProjectRow | null = null;
    if (askSession.project_id) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, system_prompt')
        .eq('id', askSession.project_id)
        .maybeSingle<ProjectRow>();

      if (error) {
        console.error('Error fetching project:', error);
      } else {
        projectData = data ?? null;
      }
    }

    let challengeData: ChallengeRow | null = null;
    if (askSession.challenge_id) {
      const { data, error } = await supabase
        .from('challenges')
        .select('id, name, system_prompt')
        .eq('id', askSession.challenge_id)
        .maybeSingle<ChallengeRow>();

      if (error) {
        console.error('Error fetching challenge:', error);
      } else {
        challengeData = data ?? null;
      }
    }

    const participantSummaries = participants.map(p => ({ name: p.name, role: p.role ?? null, description: p.description ?? null }));

    // Format messages as JSON (same as stream/route.ts)
    const conversationMessagesPayload = messages.map(message => ({
      id: message.id,
      senderType: message.senderType,
      senderName: message.senderName,
      content: message.content,
      timestamp: message.timestamp,
      planStepId: message.planStepId,
    }));

    const promptVariables = buildConversationAgentVariables({
      ask: askSession,
      project: projectData,
      challenge: challengeData,
      messages: conversationMessagesPayload,
      participants: participantSummaries,
      conversationPlan, // Include conversation plan for step-aware variables
    });

    // Build agent variables (same as stream/route.ts)
    const agentVariables: PromptVariables = {
      ask_key: askSession.ask_key,
      ask_question: promptVariables.ask_question || askSession.question,
      ask_description: promptVariables.ask_description || askSession.description || '',
      participants: promptVariables.participants || '',
      messages_json: JSON.stringify(conversationMessagesPayload),
    };

    const agentConfig = await getAgentConfigForAsk(supabase, askSession.id, agentVariables, token);

    return NextResponse.json({
      success: true,
      data: {
        systemPrompt: agentConfig.systemPrompt,
        userPrompt: agentConfig.userPrompt,
        promptVariables: promptVariables, // Pass prompt variables for template rendering
        modelConfig: agentConfig.modelConfig ? {
          id: agentConfig.modelConfig.id,
          provider: agentConfig.modelConfig.provider,
          voiceAgentProvider: (agentConfig.modelConfig as any).voiceAgentProvider,
          model: agentConfig.modelConfig.model,
          deepgramSttModel: (agentConfig.modelConfig as any).deepgramSttModel,
          deepgramTtsModel: (agentConfig.modelConfig as any).deepgramTtsModel,
          deepgramLlmProvider: (agentConfig.modelConfig as any).deepgramLlmProvider,
          deepgramLlmModel: (agentConfig.modelConfig as any).deepgramLlmModel,
          speechmaticsSttLanguage: (agentConfig.modelConfig as any).speechmaticsSttLanguage,
          speechmaticsSttOperatingPoint: (agentConfig.modelConfig as any).speechmaticsSttOperatingPoint,
          speechmaticsSttMaxDelay: (agentConfig.modelConfig as any).speechmaticsSttMaxDelay,
          speechmaticsSttEnablePartials: (agentConfig.modelConfig as any).speechmaticsSttEnablePartials,
          speechmaticsLlmProvider: (agentConfig.modelConfig as any).speechmaticsLlmProvider,
          speechmaticsLlmModel: (agentConfig.modelConfig as any).speechmaticsLlmModel,
          speechmaticsApiKeyEnvVar: (agentConfig.modelConfig as any).speechmaticsApiKeyEnvVar,
          elevenLabsVoiceId: (agentConfig.modelConfig as any).elevenLabsVoiceId,
          elevenLabsModelId: (agentConfig.modelConfig as any).elevenLabsModelId,
          elevenLabsApiKeyEnvVar: (agentConfig.modelConfig as any).elevenLabsApiKeyEnvVar,
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

