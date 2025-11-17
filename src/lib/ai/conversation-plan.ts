import type { SupabaseClient } from '@supabase/supabase-js';
import { executeAgent } from './service';
import type { PromptVariables } from './agent-config';

/**
 * Represents a single step in the conversation plan (database record)
 */
export interface ConversationPlanStep {
  id: string; // UUID of the step record
  plan_id: string; // UUID of the parent plan
  step_identifier: string; // e.g., "step_1", "step_2" - used in STEP_COMPLETE:<ID>
  step_order: number; // 1-based index (1, 2, 3, etc.)
  title: string;
  objective: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  summary: string | null; // AI-generated summary
  created_at: string;
  activated_at: string | null; // When status changed to 'active'
  completed_at: string | null; // When status changed to 'completed'
}

/**
 * LEGACY: Old structure for backward compatibility
 * New code should use ConversationPlanStep instead
 */
export interface LegacyConversationPlanStep {
  id: string; // step_identifier (e.g., "step_1")
  title: string;
  objective: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  summary?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

/**
 * LEGACY: Old plan_data JSONB structure
 * Kept for backward compatibility during migration
 */
export interface LegacyConversationPlanData {
  steps: LegacyConversationPlanStep[];
}

/**
 * Represents a stored conversation plan in the database
 */
export interface ConversationPlan {
  id: string;
  conversation_thread_id: string;

  // Metadata (extracted from plan_data for performance)
  title: string | null;
  objective: string | null;
  total_steps: number;
  completed_steps: number;
  status: 'active' | 'completed' | 'abandoned';

  // Legacy JSONB structure (for backward compatibility)
  plan_data: LegacyConversationPlanData | null;

  // Current step tracking
  current_step_id: string | null; // step_identifier (e.g., "step_1")

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Extended plan with steps loaded from normalized table
 */
export interface ConversationPlanWithSteps extends ConversationPlan {
  steps: ConversationPlanStep[]; // Loaded from ask_conversation_plan_steps
}

/**
 * Generate a conversation plan using the AI agent
 * This calls the ask-conversation-plan-generator agent
 */
export async function generateConversationPlan(
  supabase: SupabaseClient,
  askSessionId: string,
  variables: PromptVariables
): Promise<LegacyConversationPlanData> {
  console.log('🎯 Generating conversation plan for ASK session:', askSessionId);

  try {
    const agentResult = await executeAgent({
      supabase,
      agentSlug: 'ask-conversation-plan-generator',
      askSessionId,
      interactionType: 'ask.plan.generation',
      variables,
    });

    console.log('📥 Plan generation result:', {
      hasContent: !!agentResult.content,
      contentType: typeof agentResult.content,
      contentPreview: agentResult.content ? String(agentResult.content).substring(0, 200) : null,
    });

    if (typeof agentResult.content !== 'string' || agentResult.content.trim().length === 0) {
      throw new Error('Plan generator agent did not return valid content');
    }

    // Parse the JSON response from the agent
    let planData: LegacyConversationPlanData;
    try {
      // Try to extract JSON from markdown code blocks if present
      const content = agentResult.content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;

      planData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('❌ Failed to parse plan JSON:', parseError);
      console.error('Raw content:', agentResult.content);
      throw new Error('Failed to parse plan data from agent response');
    }

    // Validate the plan structure
    if (!planData.steps || !Array.isArray(planData.steps) || planData.steps.length === 0) {
      throw new Error('Invalid plan structure: missing or empty steps array');
    }

    // Ensure first step is active
    if (planData.steps.length > 0) {
      planData.steps[0].status = 'active';
      planData.steps[0].created_at = new Date().toISOString();

      // Set all other steps to pending
      for (let i = 1; i < planData.steps.length; i++) {
        planData.steps[i].status = 'pending';
      }
    }

    console.log('✅ Generated plan with', planData.steps.length, 'steps');
    return planData;
  } catch (error) {
    console.error('❌ Error generating conversation plan:', error);
    throw error;
  }
}

/**
 * Create and store a new conversation plan for a thread
 * This creates both the plan record and individual step records in normalized tables
 */
export async function createConversationPlan(
  supabase: SupabaseClient,
  conversationThreadId: string,
  planData: LegacyConversationPlanData
): Promise<ConversationPlanWithSteps> {
  console.log('💾 Creating conversation plan for thread:', conversationThreadId);

  const currentStepId = planData.steps.length > 0 ? planData.steps[0].id : null;
  const totalSteps = planData.steps.length;

  // Create the plan record
  const { data: planRecord, error: planError } = await supabase
    .from('ask_conversation_plans')
    .insert({
      conversation_thread_id: conversationThreadId,
      plan_data: planData, // Keep legacy format for backward compatibility
      current_step_id: currentStepId,
      total_steps: totalSteps,
      completed_steps: 0,
      status: 'active',
    })
    .select()
    .single();

  if (planError || !planRecord) {
    console.error('❌ Failed to create conversation plan:', planError);
    throw new Error(`Failed to create conversation plan: ${planError?.message}`);
  }

  console.log('✅ Created conversation plan:', planRecord.id);

  // Create step records in normalized table
  const now = new Date().toISOString();
  const stepRecords: Omit<ConversationPlanStep, 'id' | 'created_at'>[] = planData.steps.map(
    (step, index) => ({
      plan_id: planRecord.id,
      step_identifier: step.id,
      step_order: index + 1,
      title: step.title,
      objective: step.objective,
      status: step.status,
      summary: step.summary || null,
      activated_at: step.status === 'active' ? now : null,
      completed_at: step.completed_at || null,
    })
  );

  const { data: insertedSteps, error: stepsError } = await supabase
    .from('ask_conversation_plan_steps')
    .insert(stepRecords)
    .select();

  if (stepsError || !insertedSteps) {
    console.error('❌ Failed to create plan steps:', stepsError);
    throw new Error(`Failed to create plan steps: ${stepsError?.message}`);
  }

  console.log('✅ Created', insertedSteps.length, 'plan steps');

  return {
    ...planRecord,
    steps: insertedSteps as ConversationPlanStep[],
  } as ConversationPlanWithSteps;
}

/**
 * Get the conversation plan for a thread (without steps)
 */
export async function getConversationPlan(
  supabase: SupabaseClient,
  conversationThreadId: string
): Promise<ConversationPlan | null> {
  const { data, error } = await supabase
    .from('ask_conversation_plans')
    .select('*')
    .eq('conversation_thread_id', conversationThreadId)
    .maybeSingle();

  if (error) {
    console.error('❌ Failed to fetch conversation plan:', error);
    return null;
  }

  return data as ConversationPlan | null;
}

/**
 * Get the conversation plan with all steps loaded from normalized table
 */
export async function getConversationPlanWithSteps(
  supabase: SupabaseClient,
  conversationThreadId: string
): Promise<ConversationPlanWithSteps | null> {
  // Get the plan
  const plan = await getConversationPlan(supabase, conversationThreadId);
  if (!plan) {
    return null;
  }

  // Get the steps
  const { data: steps, error: stepsError } = await supabase
    .from('ask_conversation_plan_steps')
    .select('*')
    .eq('plan_id', plan.id)
    .order('step_order', { ascending: true });

  if (stepsError) {
    console.error('❌ Failed to fetch plan steps:', stepsError);
    return null;
  }

  // Ensure the legacy plan_data structure stays in sync with normalized steps
  const legacySteps: LegacyConversationPlanStep[] = (steps || []).map((step) => ({
    id: step.step_identifier,
    title: step.title,
    objective: step.objective,
    status: step.status,
    summary: step.summary,
    created_at: step.created_at,
    completed_at: step.completed_at,
  }));

  const planDataWithSyncedSteps: LegacyConversationPlanData = {
    ...(plan.plan_data ?? { steps: [] }),
    steps: legacySteps,
  };

  return {
    ...plan,
    plan_data: planDataWithSyncedSteps,
    steps: (steps || []) as ConversationPlanStep[],
  } as ConversationPlanWithSteps;
}

/**
 * Get a specific step by its identifier
 */
export async function getPlanStep(
  supabase: SupabaseClient,
  planId: string,
  stepIdentifier: string
): Promise<ConversationPlanStep | null> {
  const { data, error } = await supabase
    .from('ask_conversation_plan_steps')
    .select('*')
    .eq('plan_id', planId)
    .eq('step_identifier', stepIdentifier)
    .maybeSingle();

  if (error) {
    console.error('❌ Failed to fetch plan step:', error);
    return null;
  }

  return data as ConversationPlanStep | null;
}

/**
 * Get the currently active step for a plan
 */
export async function getActiveStep(
  supabase: SupabaseClient,
  planId: string
): Promise<ConversationPlanStep | null> {
  const { data, error } = await supabase
    .from('ask_conversation_plan_steps')
    .select('*')
    .eq('plan_id', planId)
    .eq('status', 'active')
    .order('step_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('❌ Failed to fetch active step:', error);
    return null;
  }

  return data as ConversationPlanStep | null;
}

/**
 * Complete a step and activate the next one
 * This updates both the normalized steps table and the plan's current_step_id
 * If askSessionId is provided, triggers async summary generation after completion
 */
export async function completeStep(
  supabase: SupabaseClient,
  conversationThreadId: string,
  completedStepIdentifier: string,
  stepSummary?: string,
  askSessionId?: string
): Promise<ConversationPlan | null> {
  console.log('🔄 Completing step:', { conversationThreadId, completedStepIdentifier, stepSummary });

  // Get the plan
  const plan = await getConversationPlan(supabase, conversationThreadId);
  if (!plan) {
    console.error('❌ No plan found for thread:', conversationThreadId);
    return null;
  }

  // Get the step to complete
  const completedStep = await getPlanStep(supabase, plan.id, completedStepIdentifier);
  if (!completedStep) {
    console.error('❌ Step not found:', completedStepIdentifier);
    return null;
  }

  const now = new Date().toISOString();

  // Mark the step as completed
  const { error: completeError } = await supabase
    .from('ask_conversation_plan_steps')
    .update({
      status: 'completed',
      completed_at: now,
      summary: stepSummary || completedStep.summary,
    })
    .eq('id', completedStep.id);

  if (completeError) {
    console.error('❌ Failed to complete step:', completeError);
    return null;
  }

  // Find the next step by order
  const { data: nextStep } = await supabase
    .from('ask_conversation_plan_steps')
    .select('*')
    .eq('plan_id', plan.id)
    .eq('step_order', completedStep.step_order + 1)
    .maybeSingle();

  let nextStepIdentifier: string | null = null;

  // Activate the next step if it exists
  if (nextStep) {
    const { error: activateError } = await supabase
      .from('ask_conversation_plan_steps')
      .update({
        status: 'active',
        activated_at: now,
      })
      .eq('id', nextStep.id);

    if (activateError) {
      console.error('❌ Failed to activate next step:', activateError);
    } else {
      nextStepIdentifier = (nextStep as ConversationPlanStep).step_identifier;
    }
  }

  // Update the plan's current_step_id
  // The completed_steps counter is auto-updated by the trigger
  const { data: updatedPlan, error: updateError } = await supabase
    .from('ask_conversation_plans')
    .update({
      current_step_id: nextStepIdentifier,
      updated_at: now,
    })
    .eq('id', plan.id)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Failed to update plan:', updateError);
    return null;
  }

  console.log(
    '✅ Completed step:',
    completedStepIdentifier,
    'next step:',
    nextStepIdentifier || 'none (plan complete)'
  );

  // Trigger async summary generation if askSessionId is provided
  if (askSessionId) {
    // Execute summary generation via a dedicated API endpoint
    // This ensures execution even if the current request context ends
    const stepIdToSummarize = completedStep.id;
    
    const triggerSummaryGeneration = async () => {
      try {
        // Get the ask_session_id from the conversation thread
        const { data: thread } = await supabase
          .from('conversation_threads')
          .select('ask_session_id')
          .eq('id', conversationThreadId)
          .single();
        
        if (!thread?.ask_session_id) {
          console.warn('⚠️ [ASYNC] Could not find ask_session_id for thread:', conversationThreadId);
          return;
        }

        // Get the ask_key from the ask_session
        const { data: askSession } = await supabase
          .from('ask_sessions')
          .select('ask_key')
          .eq('id', thread.ask_session_id)
          .single();
        
        if (!askSession?.ask_key) {
          console.warn('⚠️ [ASYNC] Could not find ask_key for session:', thread.ask_session_id);
          return;
        }

        // Build absolute URL for the endpoint
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL 
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
          || 'http://localhost:3000';
        const endpoint = `${baseUrl}/api/ask/${askSession.ask_key}/step-summary`;
        
        console.log('📝 [ASYNC] Triggering summary generation via API:', endpoint, 'stepId:', stepIdToSummarize);
        
        // Call the endpoint without waiting for response (fire and forget)
        fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            stepId: stepIdToSummarize,
            askSessionId: askSessionId,
          }),
        }).catch((error) => {
          console.error('❌ [ASYNC] Failed to trigger summary generation endpoint:', error);
        });
      } catch (error) {
        console.error('❌ [ASYNC] Error setting up summary generation:', error);
      }
    };

    // Execute in background without blocking
    Promise.resolve().then(triggerSummaryGeneration).catch((error) => {
      console.error('❌ [ASYNC] Unhandled error triggering summary generation:', error);
    });
    
    console.log('📝 [ASYNC] Summary generation task queued for step:', stepIdToSummarize);
  }

  return updatedPlan as ConversationPlan;
}

/**
 * LEGACY: Update plan step (backward compatibility wrapper)
 * @deprecated Use completeStep instead
 */
export async function updatePlanStep(
  supabase: SupabaseClient,
  conversationThreadId: string,
  completedStepId: string,
  stepSummary?: string
): Promise<ConversationPlan | null> {
  return completeStep(supabase, conversationThreadId, completedStepId, stepSummary);
}

/**
 * Generate an AI summary for a completed step using messages linked to that step
 */
export async function generateStepSummary(
  supabase: SupabaseClient,
  stepId: string,
  askSessionId: string
): Promise<string | null> {
  console.log('📝 Generating AI summary for step:', stepId);

  // Get the step details
  const { data: step, error: stepError } = await supabase
    .from('ask_conversation_plan_steps')
    .select('*')
    .eq('id', stepId)
    .single();

  if (stepError || !step) {
    console.error('❌ Failed to fetch step for summary:', stepError);
    return null;
  }

  const typedStep = step as ConversationPlanStep;

  // Fetch messages linked to this step
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('id, sender_type, content, created_at')
    .eq('plan_step_id', stepId)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('❌ Failed to fetch messages for summary:', messagesError);
    return null;
  }

  if (!messages || messages.length === 0) {
    return 'Aucun message échangé lors de cette étape.';
  }

  // Format messages for the agent
  const formattedMessages = messages
    .map((msg) => {
      const sender = msg.sender_type === 'user' ? 'Participant' : 'Assistant IA';
      const timestamp = new Date(msg.created_at).toLocaleString('fr-FR');
      return `[${timestamp}] ${sender}:\n${msg.content}`;
    })
    .join('\n\n---\n\n');

  // Calculate step duration
  const startTime = new Date(typedStep.activated_at || typedStep.created_at);
  const endTime = new Date(typedStep.completed_at || new Date());
  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  const durationFormatted =
    durationMinutes < 60
      ? `${durationMinutes} minutes`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60}`;

  // Prepare variables for the agent
  const variables: PromptVariables = {
    step_title: typedStep.title,
    step_objective: typedStep.objective,
    step_duration: durationFormatted,
    message_count: String(messages.length),
    step_messages: formattedMessages,
  };

  try {
    // Call the summarizer agent
    const agentResult = await executeAgent({
      supabase,
      agentSlug: 'ask-conversation-step-summarizer',
      askSessionId,
      interactionType: 'ask.step.summary',
      variables,
    });

    if (typeof agentResult.content !== 'string' || agentResult.content.trim().length === 0) {
      console.error('❌ Summarizer agent returned empty content');
      return `${messages.length} messages échangés lors de cette étape.`;
    }

    const summary = agentResult.content.trim();
    console.log('✅ Generated AI summary:', summary.substring(0, 100) + '...');
    return summary;
  } catch (error) {
    console.error('❌ Failed to generate AI summary:', error);
    return `${messages.length} messages échangés lors de cette étape.`;
  }
}

/**
 * LEGACY: Simple message summarization by time range
 * @deprecated Use generateStepSummary instead which uses plan_step_id
 */
export async function summarizeStepMessages(
  supabase: SupabaseClient,
  conversationThreadId: string,
  stepStartTime: string,
  stepEndTime: string
): Promise<string> {
  console.log('📝 [LEGACY] Summarizing messages for step:', {
    conversationThreadId,
    stepStartTime,
    stepEndTime,
  });

  // Fetch messages in the time range
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, sender_type, content, created_at')
    .eq('conversation_thread_id', conversationThreadId)
    .gte('created_at', stepStartTime)
    .lte('created_at', stepEndTime)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Failed to fetch messages for summary:', error);
    return 'Failed to generate summary';
  }

  if (!messages || messages.length === 0) {
    return 'No messages exchanged during this step';
  }

  // Simple summary: count messages
  const userMessages = messages.filter((m) => m.sender_type === 'user');
  const aiMessages = messages.filter((m) => m.sender_type === 'ai');

  return `${messages.length} messages exchanged (${userMessages.length} from participants, ${aiMessages.length} from AI).`;
}

/**
 * Get the current active step from a plan (LEGACY - uses plan_data)
 * @deprecated Use getActiveStep for new code
 */
export function getCurrentStep(
  plan: ConversationPlan | ConversationPlanWithSteps
): ConversationPlanStep | LegacyConversationPlanStep | null {
  if (!plan.current_step_id) {
    return null;
  }

  // If plan has steps loaded from normalized table, use those
  if ('steps' in plan && Array.isArray(plan.steps)) {
    return plan.steps.find((step) => step.step_identifier === plan.current_step_id) || null;
  }

  // Fallback to legacy plan_data
  if (plan.plan_data?.steps) {
    return plan.plan_data.steps.find((step) => step.id === plan.current_step_id) || null;
  }

  return null;
}

/**
 * Format the plan for use in agent prompts
 */
export function formatPlanForPrompt(plan: ConversationPlan | ConversationPlanWithSteps): string {
  let steps: Array<ConversationPlanStep | LegacyConversationPlanStep>;

  // Use normalized steps if available
  if ('steps' in plan && Array.isArray(plan.steps)) {
    steps = plan.steps;
  } else if (plan.plan_data?.steps) {
    // Fallback to legacy format
    steps = plan.plan_data.steps;
  } else {
    return 'Aucun plan disponible';
  }

  const formattedSteps = steps
    .map((step, index) => {
      const statusEmoji = {
        pending: '⏳',
        active: '▶️',
        completed: '✅',
        skipped: '⏭️',
      }[step.status] || '❓';

      // Get step identifier (normalized vs legacy)
      const stepId = 'step_identifier' in step ? step.step_identifier : step.id;

      return `${index + 1}. ${statusEmoji} ${step.title} (${stepId})
   Objectif: ${step.objective}
   Statut: ${step.status}`;
    })
    .join('\n\n');

  return `Plan de conversation (${steps.length} étapes) :\n\n${formattedSteps}`;
}

/**
 * Format the current step for use in agent prompts
 */
export function formatCurrentStepForPrompt(
  step: ConversationPlanStep | LegacyConversationPlanStep | null
): string {
  if (!step) {
    return 'Aucune étape active';
  }

  // Get step identifier (normalized vs legacy)
  const stepId = 'step_identifier' in step ? step.step_identifier : step.id;

  return `Étape courante: ${step.title} (${stepId})
Objectif: ${step.objective}
Statut: ${step.status}`;
}

/**
 * Format completed steps with summaries for agent prompts
 */
export function formatCompletedStepsForPrompt(
  plan: ConversationPlan | ConversationPlanWithSteps
): string {
  let steps: Array<ConversationPlanStep | LegacyConversationPlanStep>;

  // Use normalized steps if available
  if ('steps' in plan && Array.isArray(plan.steps)) {
    steps = plan.steps;
  } else if (plan.plan_data?.steps) {
    steps = plan.plan_data.steps;
  } else {
    return 'Aucune étape complétée';
  }

  const completedSteps = steps.filter((step) => step.status === 'completed');

  if (completedSteps.length === 0) {
    return 'Aucune étape complétée pour le moment';
  }

  const formatted = completedSteps
    .map((step, index) => {
      const stepId = 'step_identifier' in step ? step.step_identifier : step.id;
      const summary = step.summary || 'Pas de résumé disponible';

      return `${index + 1}. ✅ ${step.title} (${stepId})
   Résumé: ${summary}`;
    })
    .join('\n\n');

  return `Étapes complétées (${completedSteps.length}/${steps.length}) :\n\n${formatted}`;
}

/**
 * Get plan progress as a formatted string
 */
export function formatPlanProgress(plan: ConversationPlan): string {
  const completed = plan.completed_steps;
  const total = plan.total_steps;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return `Progression du plan: ${completed}/${total} étapes (${percentage}%)`;
}

/**
 * Detect if a message contains a step completion marker
 * Format: STEP_COMPLETE:<step_id>
 */
export function detectStepCompletion(content: string): string | null {
  const match = content.match(/STEP_COMPLETE:(\w+)/);
  return match ? match[1] : null;
}
