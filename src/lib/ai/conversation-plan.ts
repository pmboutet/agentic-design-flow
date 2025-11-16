import type { SupabaseClient } from '@supabase/supabase-js';
import { executeAgent } from './service';
import type { PromptVariables } from './agent-config';

/**
 * Represents a single step in the conversation plan
 */
export interface ConversationPlanStep {
  id: string;
  title: string;
  objective: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  summary?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

/**
 * Represents the complete conversation plan structure
 */
export interface ConversationPlanData {
  steps: ConversationPlanStep[];
}

/**
 * Represents a stored conversation plan in the database
 */
export interface ConversationPlan {
  id: string;
  conversation_thread_id: string;
  plan_data: ConversationPlanData;
  current_step_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Generate a conversation plan using the AI agent
 * This calls the ask-conversation-plan-generator agent
 */
export async function generateConversationPlan(
  supabase: SupabaseClient,
  askSessionId: string,
  variables: PromptVariables
): Promise<ConversationPlanData> {
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
    let planData: ConversationPlanData;
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
 */
export async function createConversationPlan(
  supabase: SupabaseClient,
  conversationThreadId: string,
  planData: ConversationPlanData
): Promise<ConversationPlan> {
  console.log('💾 Creating conversation plan for thread:', conversationThreadId);

  const currentStepId = planData.steps.length > 0 ? planData.steps[0].id : null;

  const { data, error } = await supabase
    .from('ask_conversation_plans')
    .insert({
      conversation_thread_id: conversationThreadId,
      plan_data: planData,
      current_step_id: currentStepId,
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to create conversation plan:', error);
    throw new Error(`Failed to create conversation plan: ${error.message}`);
  }

  if (!data) {
    throw new Error('No data returned after creating conversation plan');
  }

  console.log('✅ Created conversation plan:', data.id);
  return data as ConversationPlan;
}

/**
 * Get the conversation plan for a thread
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
 * Update the current step and mark transitions
 */
export async function updatePlanStep(
  supabase: SupabaseClient,
  conversationThreadId: string,
  completedStepId: string,
  stepSummary?: string
): Promise<ConversationPlan | null> {
  console.log('🔄 Updating plan step:', { conversationThreadId, completedStepId, stepSummary });

  // Get the current plan
  const plan = await getConversationPlan(supabase, conversationThreadId);
  if (!plan) {
    console.error('❌ No plan found for thread:', conversationThreadId);
    return null;
  }

  const planData = plan.plan_data;
  const steps = planData.steps;

  // Find the completed step index
  const completedStepIndex = steps.findIndex(step => step.id === completedStepId);
  if (completedStepIndex === -1) {
    console.error('❌ Step not found in plan:', completedStepId);
    return null;
  }

  // Mark the step as completed
  steps[completedStepIndex].status = 'completed';
  steps[completedStepIndex].completed_at = new Date().toISOString();
  if (stepSummary) {
    steps[completedStepIndex].summary = stepSummary;
  }

  // Activate the next step if it exists
  let nextStepId: string | null = null;
  if (completedStepIndex + 1 < steps.length) {
    const nextStep = steps[completedStepIndex + 1];
    nextStep.status = 'active';
    nextStep.created_at = new Date().toISOString();
    nextStepId = nextStep.id;
  }

  // Update the plan in the database
  const { data, error } = await supabase
    .from('ask_conversation_plans')
    .update({
      plan_data: planData,
      current_step_id: nextStepId,
      updated_at: new Date().toISOString(),
    })
    .eq('conversation_thread_id', conversationThreadId)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to update conversation plan:', error);
    return null;
  }

  console.log('✅ Updated plan - completed step:', completedStepId, 'next step:', nextStepId);
  return data as ConversationPlan;
}

/**
 * Generate a summary of messages for a completed step
 * This could be enhanced to use an AI agent for summarization
 */
export async function summarizeStepMessages(
  supabase: SupabaseClient,
  conversationThreadId: string,
  stepStartTime: string,
  stepEndTime: string
): Promise<string> {
  console.log('📝 Summarizing messages for step:', { conversationThreadId, stepStartTime, stepEndTime });

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

  // Simple summary: count messages and extract key points
  const userMessages = messages.filter(m => m.sender_type === 'user');
  const aiMessages = messages.filter(m => m.sender_type === 'ai');

  const summary = `${messages.length} messages exchanged (${userMessages.length} from participants, ${aiMessages.length} from AI).`;
  
  // TODO: In the future, could use an AI agent to create a more detailed summary
  // For now, return a simple count-based summary
  return summary;
}

/**
 * Get the current active step from a plan
 */
export function getCurrentStep(plan: ConversationPlan): ConversationPlanStep | null {
  if (!plan.current_step_id) {
    return null;
  }

  return plan.plan_data.steps.find(step => step.id === plan.current_step_id) || null;
}

/**
 * Format the plan for use in agent prompts
 */
export function formatPlanForPrompt(plan: ConversationPlan): string {
  const steps = plan.plan_data.steps;
  
  const formattedSteps = steps.map((step, index) => {
    const statusEmoji = {
      pending: '⏳',
      active: '▶️',
      completed: '✅',
      skipped: '⏭️',
    }[step.status] || '❓';

    return `${index + 1}. ${statusEmoji} ${step.title} (${step.id})
   Objectif: ${step.objective}
   Statut: ${step.status}`;
  }).join('\n\n');

  return `Plan de conversation (${steps.length} étapes) :\n\n${formattedSteps}`;
}

/**
 * Format the current step for use in agent prompts
 */
export function formatCurrentStepForPrompt(step: ConversationPlanStep | null): string {
  if (!step) {
    return 'Aucune étape active';
  }

  return `Étape courante: ${step.title} (${step.id})
Objectif: ${step.objective}
Statut: ${step.status}`;
}

/**
 * Detect if a message contains a step completion marker
 * Format: #end_turn_step_<step_id>
 */
export function detectStepCompletion(content: string): string | null {
  const match = content.match(/#end_turn_step_(\w+)/);
  return match ? match[1] : null;
}

