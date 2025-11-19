/**
 * Unit tests for Handlebars template rendering system
 * Tests backward compatibility and new Handlebars features
 */

import { renderTemplate, extractTemplateVariables, getHandlebarsInstance } from '../templates';

describe('Template Rendering System', () => {
  describe('renderTemplate - Backward Compatibility', () => {
    test('should render simple variable substitution', () => {
      const template = 'Hello {{name}}!';
      const variables = { name: 'World' };
      expect(renderTemplate(template, variables)).toBe('Hello World!');
    });

    test('should handle multiple variables', () => {
      const template = '{{greeting}} {{name}}, welcome to {{place}}!';
      const variables = { 
        greeting: 'Hello', 
        name: 'Alice', 
        place: 'Wonderland' 
      };
      expect(renderTemplate(template, variables)).toBe('Hello Alice, welcome to Wonderland!');
    });

    test('should convert null values to empty string', () => {
      const template = 'Value: {{value}}';
      const variables = { value: null };
      expect(renderTemplate(template, variables)).toBe('Value: ');
    });

    test('should convert undefined values to empty string', () => {
      const template = 'Value: {{value}}';
      const variables = { value: undefined };
      expect(renderTemplate(template, variables)).toBe('Value: ');
    });

    test('should handle missing variables as empty string', () => {
      const template = 'Hello {{name}}, you are {{age}} years old';
      const variables = { name: 'Bob' };
      expect(renderTemplate(template, variables)).toBe('Hello Bob, you are  years old');
    });

    test('should return empty string for empty template', () => {
      expect(renderTemplate('', {})).toBe('');
    });

    test('should handle variables with dots and underscores', () => {
      const template = '{{project_name}} - {{system.prompt}}';
      const variables = { 
        project_name: 'MyProject',
        'system.prompt': 'Be helpful' 
      };
      expect(renderTemplate(template, variables)).toBe('MyProject - Be helpful');
    });

    test('should handle whitespace in variable names', () => {
      const template = '{{ name }} and {{  role  }}';
      const variables = { name: 'Alice', role: 'Developer' };
      expect(renderTemplate(template, variables)).toBe('Alice and Developer');
    });
  });

  describe('renderTemplate - Handlebars Conditionals', () => {
    test('should render if block when condition is true', () => {
      const template = '{{#if show}}Visible{{/if}}';
      const variables = { show: 'yes' };
      expect(renderTemplate(template, variables)).toBe('Visible');
    });

    test('should not render if block when condition is false', () => {
      const template = '{{#if show}}Visible{{/if}}';
      const variables = { show: '' };
      expect(renderTemplate(template, variables)).toBe('');
    });

    test('should render else block', () => {
      const template = '{{#if show}}Yes{{else}}No{{/if}}';
      const variables = { show: '' };
      expect(renderTemplate(template, variables)).toBe('No');
    });

    test('should handle unless block', () => {
      const template = '{{#unless disabled}}Enabled{{/unless}}';
      const variables = { disabled: '' };
      expect(renderTemplate(template, variables)).toBe('Enabled');
    });

    test('should handle nested conditionals', () => {
      const template = '{{#if outer}}Outer {{#if inner}}Inner{{/if}}{{/if}}';
      const variables = { outer: 'yes', inner: 'yes' };
      expect(renderTemplate(template, variables)).toBe('Outer Inner');
    });

    test('should handle complex conditional with variables', () => {
      const template = `Tu es un assistant.
{{#if system_prompt_project}}
System prompt projet : {{system_prompt_project}}
{{/if}}
{{#if system_prompt_challenge}}
System prompt challenge : {{system_prompt_challenge}}
{{/if}}`;
      const variables = { 
        system_prompt_project: 'Projet innovant',
        system_prompt_challenge: ''
      };
      const result = renderTemplate(template, variables);
      expect(result).toContain('System prompt projet : Projet innovant');
      expect(result).not.toContain('System prompt challenge :');
    });
  });

  describe('renderTemplate - Handlebars Loops', () => {
    test('should iterate over array with each', () => {
      const template = '{{#each items}}{{this}} {{/each}}';
      const variables = { items: ['a', 'b', 'c'] };
      expect(renderTemplate(template, variables)).toBe('a b c ');
    });

    test('should access array item properties', () => {
      const template = '{{#each users}}{{name}}: {{role}}\n{{/each}}';
      const variables = { 
        users: [
          { name: 'Alice', role: 'Admin' },
          { name: 'Bob', role: 'User' }
        ]
      };
      expect(renderTemplate(template, variables)).toBe('Alice: Admin\nBob: User\n');
    });

    test('should handle empty array', () => {
      const template = '{{#each items}}{{this}}{{else}}No items{{/each}}';
      const variables = { items: [] };
      expect(renderTemplate(template, variables)).toBe('No items');
    });

    test('should provide @index in loops', () => {
      const template = '{{#each items}}{{@index}}: {{this}}\n{{/each}}';
      const variables = { items: ['first', 'second', 'third'] };
      expect(renderTemplate(template, variables)).toBe('0: first\n1: second\n2: third\n');
    });

    test('should provide @first and @last in loops', () => {
      const template = '{{#each items}}{{#if @first}}START {{/if}}{{this}}{{#if @last}} END{{/if}} {{/each}}';
      const variables = { items: ['a', 'b', 'c'] };
      expect(renderTemplate(template, variables)).toBe('START a b c END ');
    });
  });

  describe('renderTemplate - Custom Helpers', () => {
    test('default helper should provide fallback value', () => {
      const template = '{{default value "N/A"}}';
      const variables = { value: '' };
      expect(renderTemplate(template, variables)).toBe('N/A');
    });

    test('default helper should use value when present', () => {
      const template = '{{default value "N/A"}}';
      const variables = { value: 'Present' };
      expect(renderTemplate(template, variables)).toBe('Present');
    });

    test('jsonParse helper should parse JSON string', () => {
      const template = '{{#with (jsonParse data)}}{{name}}: {{age}}{{/with}}';
      const variables = { data: '{"name":"Alice","age":"30"}' };
      expect(renderTemplate(template, variables)).toBe('Alice: 30');
    });

    test('jsonParse helper should handle invalid JSON', () => {
      const template = '{{#if (jsonParse data)}}Valid{{else}}Invalid{{/if}}';
      const variables = { data: 'not json' };
      expect(renderTemplate(template, variables)).toBe('Invalid');
    });

    test('formatDate helper should format ISO dates', () => {
      const template = '{{formatDate date "short"}}';
      const variables = { date: '2025-01-15T10:30:00.000Z' };
      expect(renderTemplate(template, variables)).toBe('2025-01-15');
    });

    test('formatDate helper should handle invalid dates', () => {
      const template = '{{formatDate date "short"}}';
      const variables = { date: 'invalid' };
      expect(renderTemplate(template, variables)).toBe('invalid');
    });

    test('notEmpty helper should check for non-empty values', () => {
      const template = '{{#if (notEmpty value)}}Has value{{/if}}';
      const variables = { value: 'something' };
      expect(renderTemplate(template, variables)).toBe('Has value');
    });

    test('notEmpty helper should detect empty arrays', () => {
      const template = '{{#if (notEmpty items)}}Has items{{else}}Empty{{/if}}';
      const variables = { items: [] };
      expect(renderTemplate(template, variables)).toBe('Empty');
    });

    test('length helper should return array length', () => {
      const template = 'Count: {{length items}}';
      const variables = { items: ['a', 'b', 'c'] };
      expect(renderTemplate(template, variables)).toBe('Count: 3');
    });

    test('length helper should return string length', () => {
      const template = 'Length: {{length text}}';
      const variables = { text: 'hello' };
      expect(renderTemplate(template, variables)).toBe('Length: 5');
    });

    test('json helper should stringify objects', () => {
      const template = '{{json data}}';
      const variables = { data: { key: 'value' } };
      const result = renderTemplate(template, variables);
      expect(result).toContain('"key"');
      expect(result).toContain('"value"');
    });

    test('uppercase helper should convert to uppercase', () => {
      const template = '{{uppercase text}}';
      const variables = { text: 'hello' };
      expect(renderTemplate(template, variables)).toBe('HELLO');
    });

    test('lowercase helper should convert to lowercase', () => {
      const template = '{{lowercase text}}';
      const variables = { text: 'HELLO' };
      expect(renderTemplate(template, variables)).toBe('hello');
    });

    test('truncate helper should truncate long strings', () => {
      const template = '{{truncate text 10}}';
      const variables = { text: 'This is a very long string' };
      expect(renderTemplate(template, variables)).toBe('This is a ...');
    });

    test('truncate helper should not truncate short strings', () => {
      const template = '{{truncate text 20}}';
      const variables = { text: 'Short' };
      expect(renderTemplate(template, variables)).toBe('Short');
    });
  });

  describe('renderTemplate - Complex AI Prompt Scenarios', () => {
    test('should render conversation agent prompt with conditionals', () => {
      const template = `Tu es un assistant IA.

Contexte :
- Question ASK : {{ask_question}}
{{#if ask_description}}
- Description : {{ask_description}}
{{/if}}

{{#if system_prompt_project}}
System prompt projet : {{system_prompt_project}}
{{/if}}

{{#if system_prompt_challenge}}
System prompt challenge : {{system_prompt_challenge}}
{{/if}}`;

      const variables = {
        ask_question: 'Comment améliorer?',
        ask_description: 'Optimisation des processus',
        system_prompt_project: 'Projet innovant',
        system_prompt_challenge: ''
      };

      const result = renderTemplate(template, variables);
      expect(result).toContain('Comment améliorer?');
      expect(result).toContain('Optimisation des processus');
      expect(result).toContain('System prompt projet : Projet innovant');
      expect(result).not.toContain('System prompt challenge :');
    });

    test('should render participant list with loop', () => {
      const template = `Participants :
{{#each participants}}
- {{name}} ({{role}})
{{/each}}`;

      const variables = {
        participants: [
          { name: 'Alice', role: 'Manager' },
          { name: 'Bob', role: 'Developer' },
          { name: 'Carol', role: 'Designer' }
        ]
      };

      const result = renderTemplate(template, variables);
      expect(result).toContain('- Alice (Manager)');
      expect(result).toContain('- Bob (Developer)');
      expect(result).toContain('- Carol (Designer)');
    });

    test('should handle ASK suggestions format', () => {
      const template = `{{#each suggestions}}
{{@index}}. {{title}}
   Question: {{question}}
   {{#if description}}Description: {{description}}{{/if}}
{{/each}}`;

      const variables = {
        suggestions: [
          { title: 'Suggestion 1', question: 'Question 1?', description: 'Details' },
          { title: 'Suggestion 2', question: 'Question 2?', description: '' }
        ]
      };

      const result = renderTemplate(template, variables);
      expect(result).toContain('0. Suggestion 1');
      expect(result).toContain('1. Suggestion 2');
      expect(result).toContain('Description: Details');
      expect(result).not.toContain('Description: \n');
    });
  });

  describe('renderTemplate - Error Handling', () => {
    test('should handle syntax errors gracefully', () => {
      const template = '{{#if unclosed}}test';
      const variables = { unclosed: 'value' };
      // Should return empty string on error
      expect(renderTemplate(template, variables)).toBe('');
    });

    test('should handle deeply nested variables', () => {
      const template = '{{user.profile.name}}';
      const variables = { 
        user: { profile: { name: 'Alice' } } 
      };
      expect(renderTemplate(template, variables)).toBe('Alice');
    });
  });

  describe('extractTemplateVariables', () => {
    test('should extract simple variables', () => {
      const template = 'Hello {{name}} from {{place}}';
      const variables = extractTemplateVariables(template);
      expect(variables).toContain('name');
      expect(variables).toContain('place');
      expect(variables).toHaveLength(2);
    });

    test('should extract variables with underscores and dots', () => {
      const template = '{{project_name}} {{system.prompt}}';
      const variables = extractTemplateVariables(template);
      expect(variables).toContain('project_name');
      expect(variables).toContain('system.prompt');
    });

    test('should deduplicate variables', () => {
      const template = '{{name}} and {{name}} and {{name}}';
      const variables = extractTemplateVariables(template);
      expect(variables).toEqual(['name']);
    });

    test('should extract variables from conditionals', () => {
      const template = '{{#if condition}}{{value}}{{/if}}';
      const variables = extractTemplateVariables(template);
      expect(variables).toContain('condition');
      expect(variables).toContain('value');
    });

    test('should extract variables from loops', () => {
      const template = '{{#each items}}{{name}}{{/each}}';
      const variables = extractTemplateVariables(template);
      expect(variables).toContain('items');
      expect(variables).toContain('name');
    });

    test('should handle empty template', () => {
      expect(extractTemplateVariables('')).toEqual([]);
    });

    test('should extract from complex template', () => {
      const template = `
        {{ask_question}}
        {{#if system_prompt_project}}
          {{system_prompt_project}}
        {{/if}}
        {{#each participants}}
          {{name}}
        {{/each}}
      `;
      const variables = extractTemplateVariables(template);
      expect(variables).toContain('ask_question');
      expect(variables).toContain('system_prompt_project');
      expect(variables).toContain('participants');
      expect(variables).toContain('name');
    });
  });

  describe('getHandlebarsInstance', () => {
    test('should return Handlebars instance', () => {
      const instance = getHandlebarsInstance();
      expect(instance).toBeDefined();
      expect(typeof instance.compile).toBe('function');
    });

    test('should allow registering custom helpers', () => {
      const instance = getHandlebarsInstance();
      instance.registerHelper('customTest', () => 'custom value');
      
      const template = '{{customTest}}';
      const result = renderTemplate(template, {});
      expect(result).toBe('custom value');
    });
  });
});


