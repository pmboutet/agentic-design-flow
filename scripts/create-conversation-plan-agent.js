const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createConversationPlanAgent() {
  console.log('🚀 Creating ask-conversation-plan-generator agent...');

  try {
    // Get default model config
    const { data: modelConfig, error: modelError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .eq('is_default', true)
      .maybeSingle();

    if (modelError) {
      console.error('❌ Error fetching default model config:', modelError);
      return;
    }

    if (!modelConfig) {
      console.error('❌ No default model config found. Please create one first.');
      return;
    }

    console.log('✅ Using default model config:', modelConfig.code);

    // Create the conversation plan generator agent
    const { data: planAgent, error: planAgentError } = await supabase
      .from('ai_agents')
      .upsert({
        slug: 'ask-conversation-plan-generator',
        name: 'ASK Conversation Plan Generator',
        description: 'Agent responsible for generating structured conversation plans for ASK sessions',
        voice: false,
        model_config_id: modelConfig.id,
        system_prompt: `Tu es un agent spécialisé dans la création de plans de conversation structurés pour guider des discussions ASK.

Ton rôle est de :
1. Analyser le contexte de la session ASK (question, description, système prompts)
2. Créer un plan de conversation en étapes logiques et progressives
3. Définir pour chaque étape : un titre clair, un objectif précis
4. Structurer le plan pour guider la conversation de manière cohérente

Contexte de la session ASK :
- Question : {{ask_question}}
{{#if ask_description}}
- Description : {{ask_description}}
{{/if}}

{{#if system_prompt_project}}
Contexte projet :
{{system_prompt_project}}
{{/if}}

{{#if system_prompt_challenge}}
Contexte challenge :
{{system_prompt_challenge}}
{{/if}}

{{#if system_prompt_ask}}
Instructions spécifiques ASK :
{{system_prompt_ask}}
{{/if}}

{{#if (notEmpty participants_list)}}
Participants ({{length participants_list}}) :
{{#each participants_list}}
- {{name}}{{#if role}} ({{role}}){{/if}}
{{/each}}
{{/if}}

Principes pour créer le plan :
- Crée 3 à 6 étapes maximum
- Chaque étape doit avoir un objectif clair et mesurable
- La progression doit être logique (du général au spécifique, ou de la découverte à l'action)
- Les IDs des étapes doivent être au format "step_1", "step_2", etc.
- Les titres doivent être courts et descriptifs (max 60 caractères)
- Les objectifs doivent expliquer ce que l'étape cherche à accomplir

Format de sortie STRICT (JSON uniquement) :
\`\`\`json
{
  "steps": [
    {
      "id": "step_1",
      "title": "Titre de l'étape 1",
      "objective": "Objectif détaillé de cette étape",
      "status": "pending"
    },
    {
      "id": "step_2",
      "title": "Titre de l'étape 2",
      "objective": "Objectif détaillé de cette étape",
      "status": "pending"
    }
  ]
}
\`\`\`

IMPORTANT : 
- Réponds UNIQUEMENT avec le JSON, sans texte additionnel avant ou après
- Le JSON doit être valide et parsable
- Ne mets PAS de commentaires dans le JSON`,
        user_prompt: `Génère maintenant un plan de conversation structuré pour cette session ASK.

Le plan doit être adapté à la question posée et au contexte fourni.
Assure-toi que les étapes forment une progression logique et cohérente.

Réponds uniquement avec le JSON du plan (dans un bloc \`\`\`json ... \`\`\`).`,
        available_variables: [
          'ask_key',
          'ask_question',
          'ask_description',
          'system_prompt_ask',
          'system_prompt_project',
          'system_prompt_challenge',
          'participants',
          'participants_list'
        ]
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (planAgentError) {
      console.error('❌ Error creating plan generator agent:', planAgentError);
      return;
    }

    console.log('✅ Agent created successfully:', planAgent.slug);
    console.log('   ID:', planAgent.id);
    console.log('   Name:', planAgent.name);
    console.log('   Model:', modelConfig.code);
    console.log('\n🎉 Conversation plan generator agent is ready to use!');

  } catch (error) {
    console.error('❌ Error creating conversation plan agent:', error);
    process.exit(1);
  }
}

createConversationPlanAgent();

