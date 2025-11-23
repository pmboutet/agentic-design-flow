const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function backfillConversationPlans(dryRun = true) {
  console.log('🚀 Backfill des plans de conversation');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (simulation)' : '✍️  WRITE (création réelle)'}\n`);

  try {
    // 1. Récupérer tous les threads qui n'ont pas de plan
    console.log('1️⃣ Recherche des threads sans plan...');
    const { data: threadsWithoutPlan, error: threadsError } = await supabase
      .from('conversation_threads')
      .select(`
        id,
        ask_session_id,
        is_shared,
        user_id,
        ask_sessions (
          id,
          ask_key,
          question,
          description,
          system_prompt,
          project_id,
          challenge_id,
          projects (
            id,
            name,
            system_prompt
          ),
          challenges (
            id,
            name,
            system_prompt
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (threadsError) {
      throw threadsError;
    }

    console.log(`   Trouvé ${threadsWithoutPlan.length} thread(s)`);

    // Filtrer ceux qui ont déjà un plan
    const threadsNeedingPlan = [];
    for (const thread of threadsWithoutPlan) {
      const { data: existingPlan } = await supabase
        .from('ask_conversation_plans')
        .select('id')
        .eq('conversation_thread_id', thread.id)
        .maybeSingle();

      if (!existingPlan) {
        threadsNeedingPlan.push(thread);
      }
    }

    console.log(`   ${threadsNeedingPlan.length} thread(s) sans plan\n`);

    if (threadsNeedingPlan.length === 0) {
      console.log('✅ Tous les threads ont déjà un plan !');
      return;
    }

    // 2. Pour chaque thread, générer un plan
    let created = 0;
    let failed = 0;

    for (const thread of threadsNeedingPlan) {
      const askSession = Array.isArray(thread.ask_sessions) 
        ? thread.ask_sessions[0] 
        : thread.ask_sessions;

      if (!askSession) {
        console.log(`   ⚠️  Thread ${thread.id}: ASK session not found, skipping`);
        continue;
      }

      console.log(`\n📋 Thread ${thread.id.substring(0, 8)}...`);
      console.log(`   ASK: ${askSession.question.substring(0, 60)}...`);
      console.log(`   Key: ${askSession.ask_key}`);

      // Récupérer les participants
      const { data: participants } = await supabase
        .from('ask_participants')
        .select('participant_name, role, profiles!user_id(id, full_name, first_name, last_name)')
        .eq('ask_session_id', askSession.id);

      const participantSummaries = (participants || []).map(p => {
        const profile = p.profiles;
        let name = p.participant_name;
        
        if (!name && profile) {
          name = profile.full_name || 
                 [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
                 'Participant';
        }

        return {
          name: name || 'Participant',
          role: p.role || null
        };
      });

      // Préparer les variables
      const project = Array.isArray(askSession.projects) 
        ? askSession.projects[0] 
        : askSession.projects;
      
      const challenge = Array.isArray(askSession.challenges)
        ? askSession.challenges[0]
        : askSession.challenges;

      const variables = {
        ask_key: askSession.ask_key,
        ask_question: askSession.question,
        ask_description: askSession.description || '',
        system_prompt_ask: askSession.system_prompt || '',
        system_prompt_project: project?.system_prompt || '',
        system_prompt_challenge: challenge?.system_prompt || '',
        participants: participantSummaries.map(p => p.name).join(', '),
        participants_list: participantSummaries,
      };

      if (dryRun) {
        console.log(`   🔍 Simulation - Variables prêtes pour la génération`);
        console.log(`      Participants: ${participantSummaries.length}`);
        continue;
      }

      // Générer le plan avec l'IA
      try {
        console.log(`   🎯 Génération du plan...`);
        
        // Appeler directement l'agent via executeAgent
        const { data: agent } = await supabase
          .from('ai_agents')
          .select('*, model_config:ai_model_configs!model_config_id(*)')
          .eq('slug', 'ask-conversation-plan-generator')
          .single();

        if (!agent) {
          throw new Error('Agent ask-conversation-plan-generator not found');
        }

        // Remplacer les variables dans le prompt
        let systemPrompt = agent.system_prompt;
        let userPrompt = agent.user_prompt;

        for (const [key, value] of Object.entries(variables)) {
          const placeholder = `{{${key}}}`;
          const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
          systemPrompt = systemPrompt.replaceAll(placeholder, valueStr);
          userPrompt = userPrompt.replaceAll(placeholder, valueStr);
        }

        // Appeler le modèle AI directement
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          throw new Error('ANTHROPIC_API_KEY not found');
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: agent.model_config.model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: userPrompt
            }]
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(`API error: ${result.error?.message || 'Unknown error'}`);
        }

        const content = result.content[0]?.text;
        if (!content) {
          throw new Error('No content in response');
        }

        // Parser le JSON
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        const planData = JSON.parse(jsonString);

        if (!planData.steps || !Array.isArray(planData.steps)) {
          throw new Error('Invalid plan structure');
        }

        // Set first step as active
        planData.steps[0].status = 'active';
        planData.steps[0].created_at = new Date().toISOString();
        
        for (let i = 1; i < planData.steps.length; i++) {
          planData.steps[i].status = 'pending';
        }

        // Sauvegarder le plan
        const { data: plan, error: createError } = await supabase
          .from('ask_conversation_plans')
          .insert({
            conversation_thread_id: thread.id,
            plan_data: planData,
            current_step_id: planData.steps[0].id,
            total_steps: planData.steps.length,
            completed_steps: 0,
            status: 'active',
          })
          .select()
          .single();

        if (createError) {
          throw createError;
        }

        // Create step records in normalized table
        const now = new Date().toISOString();
        const stepRecords = planData.steps.map((step, index) => ({
          plan_id: plan.id,
          step_identifier: step.id,
          step_order: index + 1,
          title: step.title,
          objective: step.objective,
          status: step.status,
          summary: step.summary || null,
          activated_at: step.status === 'active' ? now : null,
          completed_at: step.completed_at || null,
        }));

        const { error: stepsError } = await supabase
          .from('ask_conversation_plan_steps')
          .insert(stepRecords);

        if (stepsError) {
          throw stepsError;
        }

        console.log(`   ✅ Plan créé avec ${planData.steps.length} étapes`);
        planData.steps.forEach((step, i) => {
          console.log(`      ${i + 1}. ${step.title} (${step.status})`);
        });

        created++;
      } catch (error) {
        console.error(`   ❌ Erreur: ${error.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Résumé:`);
    console.log(`   Threads analysés: ${threadsNeedingPlan.length}`);
    console.log(`   Plans créés: ${created}`);
    console.log(`   Échecs: ${failed}`);
    console.log('');

    if (dryRun) {
      console.log('💡 Pour créer réellement les plans, relancez avec: node scripts/backfill-conversation-plans.js --write');
    } else {
      console.log('✅ Backfill terminé !');
    }

  } catch (error) {
    console.error('❌ Erreur lors du backfill:', error);
    process.exit(1);
  }
}

// Parse arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--write');

backfillConversationPlans(dryRun);

