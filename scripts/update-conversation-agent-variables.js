/**
 * Script to update the available_variables for ask-conversation-response agent
 * This includes all variables used by the conversation agent including:
 * - Basic ASK variables
 * - Participant variables
 * - Message variables
 * - System prompt variables
 * - Conversation plan variables
 * - Pacing variables
 * - Time tracking variables
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Complete list of all variables available for ask-conversation-response agent
const ALL_AVAILABLE_VARIABLES = [
  // Basic ASK variables
  'ask_key',
  'ask_question',
  'ask_description',

  // Participant variables
  'participants',           // Comma-separated string
  'participants_list',      // Array for Handlebars {{#each}}
  'participant_name',       // Name of last user who messaged

  // Message variables
  'messages_json',          // Full conversation as JSON array
  'messages_array',         // Internal array for {{recentMessages}} helper
  'latest_user_message',    // Content of last user message
  'message_history',        // Legacy text format: "Name: content"

  // Step-specific messages
  'step_messages',          // Messages for current step (text format)
  'step_messages_json',     // Messages for current step (JSON)

  // System prompts (hierarchical)
  'system_prompt_ask',
  'system_prompt_project',
  'system_prompt_challenge',

  // Conversation plan variables
  'conversation_plan',      // Full plan formatted
  'current_step',           // Current step objective
  'current_step_id',        // Step identifier for STEP_COMPLETE signal
  'completed_steps_summary', // Summary of completed steps
  'plan_progress',          // Progress indicator (e.g., "2/5")

  // Pacing variables (static configuration)
  'expected_duration_minutes',   // Target total duration
  'duration_per_step',           // Budget per step
  'optimal_questions_min',       // Min questions target
  'optimal_questions_max',       // Max questions target
  'pacing_level',                // "intensive" | "standard" | "deep"
  'pacing_instructions',         // Formatted pacing guidance

  // Time tracking variables (dynamic, real-time)
  'conversation_elapsed_minutes', // Total time elapsed
  'step_elapsed_minutes',         // Time in current step
  'questions_asked_total',        // AI questions asked (total)
  'questions_asked_in_step',      // AI questions asked (this step)
  'time_remaining_minutes',       // Time left
  'is_overtime',                  // "true" | "false" - global overtime
  'overtime_minutes',             // How much over time (global)
  'step_is_overtime',             // "true" | "false" - step overtime
  'step_overtime_minutes',        // How much over time (step)
];

async function updateAgentVariables() {
  console.log('Updating available_variables for ask-conversation-response agent...\n');

  try {
    // Fetch current agent
    const { data: currentAgent, error: fetchError } = await supabase
      .from('ai_agents')
      .select('id, slug, name, available_variables')
      .eq('slug', 'ask-conversation-response')
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Error fetching agent: ${fetchError.message}`);
    }

    if (!currentAgent) {
      throw new Error('Agent ask-conversation-response not found');
    }

    console.log(`Found agent: ${currentAgent.name} (${currentAgent.id})\n`);
    console.log('Current variables:', currentAgent.available_variables?.length || 0);
    console.log('New variables:', ALL_AVAILABLE_VARIABLES.length);

    // Find new variables being added
    const currentVars = new Set(currentAgent.available_variables || []);
    const newVars = ALL_AVAILABLE_VARIABLES.filter(v => !currentVars.has(v));

    if (newVars.length > 0) {
      console.log('\nNew variables being added:');
      newVars.forEach(v => console.log(`  + ${v}`));
    }

    // Update the agent
    const { error: updateError } = await supabase
      .from('ai_agents')
      .update({
        available_variables: ALL_AVAILABLE_VARIABLES,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', 'ask-conversation-response');

    if (updateError) {
      throw new Error(`Error updating agent: ${updateError.message}`);
    }

    console.log('\n✅ Successfully updated available_variables');
    console.log(`\nTotal variables: ${ALL_AVAILABLE_VARIABLES.length}`);
    console.log('\nCategories:');
    console.log('  - Basic ASK: ask_key, ask_question, ask_description');
    console.log('  - Participants: participants, participants_list, participant_name');
    console.log('  - Messages: messages_json, messages_array, latest_user_message, message_history');
    console.log('  - Step messages: step_messages, step_messages_json');
    console.log('  - System prompts: system_prompt_ask, system_prompt_project, system_prompt_challenge');
    console.log('  - Plan: conversation_plan, current_step, current_step_id, completed_steps_summary, plan_progress');
    console.log('  - Pacing: expected_duration_minutes, duration_per_step, optimal_questions_min/max, pacing_level, pacing_instructions');
    console.log('  - Time tracking: conversation_elapsed_minutes, step_elapsed_minutes, questions_asked_*, time_remaining_minutes, is_overtime, overtime_minutes, step_is_overtime, step_overtime_minutes');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateAgentVariables();
