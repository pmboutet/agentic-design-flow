/**
 * Script de validation de la migration Handlebars
 * Teste que tous les templates existants fonctionnent correctement avec le nouveau système
 */

const { renderTemplate, extractTemplateVariables } = require('../src/lib/ai/templates');

// Couleurs pour l'output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Templates existants réels extraits du système
const existingTemplates = [
  {
    name: 'Simple variable substitution',
    template: 'Tu es un assistant pour {{project_name}}. Question: {{ask_question}}',
    variables: {
      project_name: 'Innovation 2025',
      ask_question: 'Comment améliorer?'
    },
    expectedIncludes: ['Innovation 2025', 'Comment améliorer?']
  },
  {
    name: 'Multiple variables with underscores',
    template: '{{ask_question}} - {{ask_description}} - {{system_prompt_ask}}',
    variables: {
      ask_question: 'Question test',
      ask_description: 'Description test',
      system_prompt_ask: 'Prompt test'
    },
    expectedIncludes: ['Question test', 'Description test', 'Prompt test']
  },
  {
    name: 'Variables with null values',
    template: 'Question: {{ask_question}}\nDescription: {{ask_description}}\nPrompt: {{system_prompt}}',
    variables: {
      ask_question: 'Test question',
      ask_description: null,
      system_prompt: undefined
    },
    expectedIncludes: ['Question: Test question', 'Description: ', 'Prompt: ']
  },
  {
    name: 'Variables with dots',
    template: '{{project.name}} - {{system.prompt}}',
    variables: {
      'project.name': 'MyProject',
      'system.prompt': 'Be helpful'
    },
    expectedIncludes: ['MyProject', 'Be helpful']
  },
  {
    name: 'ASK Generator style template',
    template: 'Projet: {{project_name}} (statut: {{project_status}})\nChallenge: {{challenge_title}} — {{challenge_description}}',
    variables: {
      project_name: 'Digital Transformation',
      project_status: 'active',
      challenge_title: 'Process Optimization',
      challenge_description: 'Improve workflows'
    },
    expectedIncludes: ['Digital Transformation', 'active', 'Process Optimization', 'Improve workflows']
  },
  {
    name: 'Challenge Builder style template',
    template: 'Challenge: {{parent_challenge_name}}\n\nContexte: {{parent_challenge_context}}\nObjectifs: {{parent_challenge_objectives}}',
    variables: {
      parent_challenge_name: 'Innovation Strategy',
      parent_challenge_context: 'Market analysis',
      parent_challenge_objectives: 'Define roadmap'
    },
    expectedIncludes: ['Innovation Strategy', 'Market analysis', 'Define roadmap']
  },
  {
    name: 'Conversation Agent style template',
    template: `Tu es un assistant IA.

Contexte :
- Question ASK : {{ask_question}}
- Description : {{ask_description}}

System prompt projet : {{system_prompt_project}}
System prompt challenge : {{system_prompt_challenge}}`,
    variables: {
      ask_question: 'How to improve?',
      ask_description: 'Optimization',
      system_prompt_project: 'Innovation project',
      system_prompt_challenge: ''
    },
    expectedIncludes: ['How to improve?', 'Optimization', 'Innovation project']
  },
  {
    name: 'Variables with whitespace',
    template: '{{ name }} and {{  role  }} from {{ location }}',
    variables: {
      name: 'Alice',
      role: 'Developer',
      location: 'Paris'
    },
    expectedIncludes: ['Alice', 'Developer', 'Paris']
  },
  {
    name: 'Missing variables (should be empty)',
    template: 'Name: {{name}}, Age: {{age}}, City: {{city}}',
    variables: {
      name: 'Bob'
    },
    expectedIncludes: ['Name: Bob', 'Age: ', 'City: ']
  },
  {
    name: 'Complex real-world conversation prompt',
    template: `Tu es un assistant IA spécialisé dans la facilitation de conversations.

Ton rôle est de :
1. Analyser les messages des participants
2. Identifier les points clés
3. Poser des questions pertinentes

Contexte de la session :
- Question ASK : {{ask_question}}
- Description : {{ask_description}}
- Participants : {{participants}}

Historique des messages :
{{messages_json}}

Réponds de manière concise et pertinente.`,
    variables: {
      ask_question: 'What is our strategy?',
      ask_description: 'Strategic planning session',
      participants: 'Alice, Bob, Carol',
      messages_json: '[]'
    },
    expectedIncludes: ['What is our strategy?', 'Strategic planning session', 'Alice, Bob, Carol', '[]']
  }
];

// Nouveaux templates avec fonctionnalités Handlebars
const handlebarsTemplates = [
  {
    name: 'Conditional - if block',
    template: '{{#if show}}Visible content{{/if}}',
    variables: { show: 'yes' },
    expectedIncludes: ['Visible content']
  },
  {
    name: 'Conditional - if/else',
    template: '{{#if active}}Active{{else}}Inactive{{/if}}',
    variables: { active: '' },
    expectedIncludes: ['Inactive']
  },
  {
    name: 'Loop - each array',
    template: '{{#each items}}Item: {{this}}\n{{/each}}',
    variables: { items: ['a', 'b', 'c'] },
    expectedIncludes: ['Item: a', 'Item: b', 'Item: c']
  },
  {
    name: 'Loop - each with properties',
    template: '{{#each users}}{{name}}: {{role}}\n{{/each}}',
    variables: {
      users: [
        { name: 'Alice', role: 'Admin' },
        { name: 'Bob', role: 'User' }
      ]
    },
    expectedIncludes: ['Alice: Admin', 'Bob: User']
  },
  {
    name: 'Helper - default',
    template: 'Status: {{default status "Unknown"}}',
    variables: { status: '' },
    expectedIncludes: ['Status: Unknown']
  },
  {
    name: 'Helper - length',
    template: 'Count: {{length items}}',
    variables: { items: ['a', 'b', 'c'] },
    expectedIncludes: ['Count: 3']
  },
  {
    name: 'Complex - conditionals in real prompt',
    template: `Tu es un assistant.

{{#if system_prompt_project}}
System prompt projet : {{system_prompt_project}}
{{/if}}

{{#if system_prompt_challenge}}
System prompt challenge : {{system_prompt_challenge}}
{{/if}}`,
    variables: {
      system_prompt_project: 'Innovation project',
      system_prompt_challenge: ''
    },
    expectedIncludes: ['System prompt projet : Innovation project'],
    expectedNotIncludes: ['System prompt challenge :']
  }
];

function validateTemplate(test) {
  try {
    const result = renderTemplate(test.template, test.variables);
    
    // Check expected includes
    let passed = true;
    if (test.expectedIncludes) {
      for (const expected of test.expectedIncludes) {
        if (!result.includes(expected)) {
          log('red', `  ✗ Expected to include: "${expected}"`);
          log('red', `    Got: "${result.substring(0, 100)}..."`);
          passed = false;
        }
      }
    }

    // Check expected not includes
    if (test.expectedNotIncludes) {
      for (const notExpected of test.expectedNotIncludes) {
        if (result.includes(notExpected)) {
          log('red', `  ✗ Expected NOT to include: "${notExpected}"`);
          log('red', `    Got: "${result.substring(0, 100)}..."`);
          passed = false;
        }
      }
    }

    return passed;
  } catch (error) {
    log('red', `  ✗ Error: ${error.message}`);
    return false;
  }
}

function validateVariableExtraction(test) {
  try {
    const variables = extractTemplateVariables(test.template);
    
    // Basic check: should extract at least some variables
    const hasVariables = test.template.includes('{{');
    if (hasVariables && variables.length === 0) {
      log('yellow', `  ⚠ Warning: No variables extracted from template with {{`);
      return false;
    }
    
    return true;
  } catch (error) {
    log('red', `  ✗ Variable extraction error: ${error.message}`);
    return false;
  }
}

// Run validation
console.log('\n' + '='.repeat(70));
log('blue', '🔍 VALIDATION DE LA MIGRATION HANDLEBARS');
console.log('='.repeat(70) + '\n');

let totalTests = 0;
let passedTests = 0;

// Test existing templates (backward compatibility)
log('blue', '📝 Tests de compatibilité avec les templates existants');
console.log('-'.repeat(70));

existingTemplates.forEach(test => {
  totalTests++;
  process.stdout.write(`  ${test.name}... `);
  
  const renderPassed = validateTemplate(test);
  const extractionPassed = validateVariableExtraction(test);
  
  if (renderPassed && extractionPassed) {
    log('green', '✓ PASS');
    passedTests++;
  } else {
    log('red', '✗ FAIL');
  }
});

console.log();

// Test new Handlebars features
log('blue', '🎨 Tests des nouvelles fonctionnalités Handlebars');
console.log('-'.repeat(70));

handlebarsTemplates.forEach(test => {
  totalTests++;
  process.stdout.write(`  ${test.name}... `);
  
  const renderPassed = validateTemplate(test);
  
  if (renderPassed) {
    log('green', '✓ PASS');
    passedTests++;
  } else {
    log('red', '✗ FAIL');
  }
});

// Summary
console.log('\n' + '='.repeat(70));
log('blue', '📊 RÉSUMÉ');
console.log('='.repeat(70));

const percentage = Math.round((passedTests / totalTests) * 100);
console.log(`Total: ${totalTests} tests`);
log('green', `Réussis: ${passedTests}`);
log('red', `Échoués: ${totalTests - passedTests}`);

if (passedTests === totalTests) {
  log('green', `\n✅ SUCCÈS : Tous les tests passent (${percentage}%)`);
  log('green', '\n🎉 La migration Handlebars est validée avec succès !');
  log('blue', '\nProchaines étapes :');
  console.log('  1. Les templates existants fonctionnent sans modification');
  console.log('  2. Vous pouvez maintenant utiliser les conditions {{#if}}');
  console.log('  3. Vous pouvez maintenant utiliser les boucles {{#each}}');
  console.log('  4. Consultez docs/HANDLEBARS_TEMPLATES_GUIDE.md pour plus d\'exemples');
  process.exit(0);
} else {
  log('red', `\n❌ ÉCHEC : ${totalTests - passedTests} test(s) ont échoué`);
  log('yellow', '\n⚠️  Veuillez corriger les erreurs avant de continuer');
  process.exit(1);
}

