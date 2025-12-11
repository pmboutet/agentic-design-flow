import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabaseServer';
import { isValidAskKey, parseErrorMessage } from '@/lib/utils';
import { getAskSessionByKey, getOrCreateConversationThread, getMessagesForThread } from '@/lib/asks';
import { normaliseMessageMetadata } from '@/lib/messages';
import { executeAgent, fetchAgentBySlug } from '@/lib/ai';
import { getConversationPlanWithSteps, getActiveStep, completeStep, getCurrentStep, detectStepCompletion } from '@/lib/ai/conversation-plan';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';
import {
  buildParticipantDisplayName,
  buildMessageSenderName,
  type AskSessionRow,
  type UserRow,
  type MessageRow,
  type ProjectRow,
  type ChallengeRow,
} from '@/lib/conversation-context';
import type { ApiResponse, SuggestedQuestion } from '@/types';

const CONSULTANT_HELPER_AGENT_SLUG = 'ask-consultant-helper';
const CONSULTANT_HELPER_INTERACTION_TYPE = 'ask.consultant.helper';

interface ConsultantAnalyzeResponse {
  questions: SuggestedQuestion[];
  stepCompleted?: string;
  stepSummary?: string;
}

/**
 * Parse the consultant helper agent response to extract questions and step completion
 */
function parseConsultantHelperResponse(content: string): ConsultantAnalyzeResponse {
  const questions: SuggestedQuestion[] = [];
  let stepCompleted: string | undefined;

  // Extract STEP_COMPLETE marker using the shared detection function
  // This handles all formats: STEP_COMPLETE:step_1, **STEP_COMPLETE:step_1**, STEP_COMPLETE: (returns 'CURRENT')
  const detectedStep = detectStepCompletion(content);
  if (detectedStep) {
    stepCompleted = detectedStep;
  }

  // Extract questions with the format **Question N:** [question text]
  // Note: Using 'gi' instead of 'gis' for ES compatibility - manually handle multiline
  const questionRegex = /\*\*Question\s*\d+\s*[:：]?\*\*\s*([^\n]+(?:\n(?!\*\*Question|\n|STEP_COMPLETE)[^\n]*)*)/gi;
  let match;
  let index = 0;

  while ((match = questionRegex.exec(content)) !== null && index < 2) {
    const questionText = match[1].trim()
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (questionText) {
      questions.push({
        id: `q-${Date.now()}-${index}`,
        text: questionText,
        timestamp: new Date().toISOString(),
      });
      index++;
    }
  }

  // Fallback: if no questions found with the expected format, try to extract any bullet points
  if (questions.length === 0) {
    const bulletRegex = /[-•]\s*(.+?)(?=\n[-•]|\n\n|$)/g;
    let bulletMatch;
    let bulletIndex = 0;

    while ((bulletMatch = bulletRegex.exec(content)) !== null && bulletIndex < 2) {
      const questionText = bulletMatch[1].trim();
      if (questionText && questionText.length > 10 && questionText.includes('?')) {
        questions.push({
          id: `q-${Date.now()}-${bulletIndex}`,
          text: questionText,
          timestamp: new Date().toISOString(),
        });
        bulletIndex++;
      }
    }
  }

  // Last resort: if still no questions, look for any sentences ending with ?
  if (questions.length === 0) {
    const sentenceRegex = /([^.!?\n]+\?)/g;
    let sentenceMatch;
    let sentenceIndex = 0;

    while ((sentenceMatch = sentenceRegex.exec(content)) !== null && sentenceIndex < 2) {
      const questionText = sentenceMatch[1].trim();
      if (questionText && questionText.length > 15) {
        questions.push({
          id: `q-${Date.now()}-${sentenceIndex}`,
          text: questionText,
          timestamp: new Date().toISOString(),
        });
        sentenceIndex++;
      }
    }
  }

  return { questions, stepCompleted };
}

/**
 * POST /api/ask/[key]/consultant-analyze
 *
 * Analyzes the current conversation and returns suggested questions for the consultant.
 * Also detects STEP_COMPLETE markers and triggers step completion if found.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const body = await request.json().catch(() => ({}));
    const { conversationThreadId: requestedThreadId } = body as { conversationThreadId?: string };

    if (!key || !isValidAskKey(key)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid ASK key format'
      }, { status: 400 });
    }

    const supabase = getAdminSupabaseClient();

    // Get current user (consultant)
    let currentUserId: string | null = null;
    try {
      const serverSupabase = await createServerSupabaseClient();
      const user = await getCurrentUser();
      if (user) {
        const { data: profile } = await serverSupabase
          .from('profiles')
          .select('id')
          .eq('auth_id', user.id)
          .eq('is_active', true)
          .single();
        if (profile) {
          currentUserId = profile.id;
        }
      }
    } catch (error) {
      console.warn('Could not retrieve current user:', error);
    }

    // Fetch ASK session
    const { row: askRow, error: askError } = await getAskSessionByKey<AskSessionRow & { conversation_mode?: string | null }>(
      supabase,
      key,
      'id, ask_key, question, description, status, system_prompt, project_id, challenge_id, conversation_mode, expected_duration_minutes'
    );

    if (askError) {
      throw askError;
    }

    if (!askRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ASK introuvable pour la clé fournie'
      }, { status: 404 });
    }

    // Verify this is consultant mode
    if (askRow.conversation_mode !== 'consultant') {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Cette fonctionnalité est réservée au mode consultant'
      }, { status: 400 });
    }

    // Verify agent exists
    const helperAgent = await fetchAgentBySlug(supabase, CONSULTANT_HELPER_AGENT_SLUG, { includeModels: true });
    if (!helperAgent) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Agent consultant-helper non configuré'
      }, { status: 500 });
    }

    // Get participants
    const { data: participantRows, error: participantError } = await supabase
      .from('ask_participants')
      .select('*')
      .eq('ask_session_id', askRow.id)
      .order('joined_at', { ascending: true });

    if (participantError) {
      throw participantError;
    }

    const participantUserIds = (participantRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    let usersById: Record<string, UserRow> = {};

    if (participantUserIds.length > 0) {
      const { data: userRows, error: userError } = await supabase
        .from('profiles')
        .select('id, email, full_name, first_name, last_name, description')
        .in('id', participantUserIds);

      if (userError) {
        throw userError;
      }

      usersById = (userRows ?? []).reduce<Record<string, UserRow>>((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});
    }

    const participants = (participantRows ?? []).map((row, index) => {
      const user = row.user_id ? usersById[row.user_id] ?? null : null;
      return {
        name: buildParticipantDisplayName(row, user, index),
        role: row.role ?? null,
        description: user?.description ?? null,
      };
    });

    // Get or create conversation thread
    const askConfig = {
      conversation_mode: askRow.conversation_mode ?? null,
    };

    const { thread: conversationThread, error: threadError } = await getOrCreateConversationThread(
      supabase,
      askRow.id,
      currentUserId,
      askConfig
    );

    if (threadError) {
      throw threadError;
    }

    // Get messages for the thread
    let messageRows: MessageRow[] = [];
    if (conversationThread) {
      const { messages: threadMessages, error: threadMessagesError } = await getMessagesForThread(
        supabase,
        conversationThread.id
      );

      if (threadMessagesError) {
        throw threadMessagesError;
      }

      messageRows = threadMessages as MessageRow[];
    }

    // Add users from messages
    const messageUserIds = (messageRows ?? [])
      .map(row => row.user_id)
      .filter((value): value is string => Boolean(value));

    const additionalUserIds = messageUserIds.filter(id => !usersById[id]);

    if (additionalUserIds.length > 0) {
      const { data: extraUsers, error: extraUsersError } = await supabase
        .from('profiles')
        .select('id, email, full_name, first_name, last_name, description')
        .in('id', additionalUserIds);

      if (extraUsersError) {
        throw extraUsersError;
      }

      (extraUsers ?? []).forEach(user => {
        usersById[user.id] = user;
      });
    }

    const messages = (messageRows ?? []).map((row, index) => {
      const metadata = normaliseMessageMetadata(row.metadata);
      const user = row.user_id ? usersById[row.user_id] ?? null : null;

      return {
        id: row.id,
        senderType: row.sender_type ?? 'user',
        senderName: buildMessageSenderName(row, user, index),
        content: row.content,
        timestamp: row.created_at ?? new Date().toISOString(),
        planStepId: (row as any).plan_step_id ?? null,
      };
    });

    // If no messages yet, return empty questions
    if (messages.length === 0) {
      return NextResponse.json<ApiResponse<ConsultantAnalyzeResponse>>({
        success: true,
        data: { questions: [] }
      });
    }

    // Get project and challenge data
    let projectData: ProjectRow | null = null;
    if (askRow.project_id) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, system_prompt')
        .eq('id', askRow.project_id)
        .maybeSingle<ProjectRow>();

      if (error) throw error;
      projectData = data ?? null;
    }

    let challengeData: ChallengeRow | null = null;
    if (askRow.challenge_id) {
      const { data, error } = await supabase
        .from('challenges')
        .select('id, name, system_prompt')
        .eq('id', askRow.challenge_id)
        .maybeSingle<ChallengeRow>();

      if (error) throw error;
      challengeData = data ?? null;
    }

    // Get conversation plan
    let conversationPlan = null;
    if (conversationThread) {
      conversationPlan = await getConversationPlanWithSteps(supabase, conversationThread.id);
    }

    // Build variables for the agent
    const variables = buildConversationAgentVariables({
      ask: askRow,
      project: projectData,
      challenge: challengeData,
      messages,
      participants,
      conversationPlan,
    });

    // Execute the consultant helper agent
    console.log('🎯 [CONSULTANT-ANALYZE] Executing consultant helper agent');
    const result = await executeAgent({
      supabase,
      agentSlug: CONSULTANT_HELPER_AGENT_SLUG,
      askSessionId: askRow.id,
      interactionType: CONSULTANT_HELPER_INTERACTION_TYPE,
      variables,
    });

    console.log('📝 [CONSULTANT-ANALYZE] Agent response length:', result.content?.length ?? 0);

    // Parse the response
    const response = parseConsultantHelperResponse(result.content ?? '');

    // Handle step completion if detected
    if (response.stepCompleted && conversationThread) {
      console.log('🎯 [CONSULTANT-ANALYZE] Step completion detected:', response.stepCompleted);

      try {
        const plan = await getConversationPlanWithSteps(supabase, conversationThread.id);
        if (plan) {
          const currentStep = getCurrentStep(plan);

          // Support both normalized and legacy step structures
          const currentStepIdentifier = currentStep && 'step_identifier' in currentStep
            ? currentStep.step_identifier
            : currentStep?.id;

          // Determine which step ID to complete
          const stepIdToComplete = response.stepCompleted === 'CURRENT'
            ? currentStepIdentifier
            : response.stepCompleted;

          if (currentStep && (response.stepCompleted === 'CURRENT' || currentStepIdentifier === response.stepCompleted)) {
            // Complete the step (summary will be generated asynchronously)
            await completeStep(
              supabase,
              conversationThread.id,
              stepIdToComplete!,
              undefined,
              askRow.id
            );
            console.log('✅ [CONSULTANT-ANALYZE] Step completed:', stepIdToComplete);
          }
        }
      } catch (planError) {
        console.error('❌ [CONSULTANT-ANALYZE] Failed to complete step:', planError);
        // Don't fail the request if step completion fails
      }
    }

    return NextResponse.json<ApiResponse<ConsultantAnalyzeResponse>>({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('❌ [CONSULTANT-ANALYZE] Error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status: 500 });
  }
}
