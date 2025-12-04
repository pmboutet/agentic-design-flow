import Handlebars from 'handlebars';

// Legacy pattern for variable extraction (still useful for analysis)
const VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

// Configure Handlebars instance with custom settings
const handlebarsInstance = Handlebars.create();

// Helper: Return default value if the value is falsy
handlebarsInstance.registerHelper('default', function(value: any, defaultValue: string) {
  return value || defaultValue;
});

// Helper: Parse JSON string into object for iteration or conditional logic
handlebarsInstance.registerHelper('jsonParse', function(jsonString: string) {
  try {
    if (!jsonString || typeof jsonString !== 'string') {
      return null;
    }
    return JSON.parse(jsonString);
  } catch (e) {
    console.warn('[Templates] Failed to parse JSON:', e);
    return null;
  }
});

// Helper: Format ISO date to readable format
handlebarsInstance.registerHelper('formatDate', function(isoDate: string, format?: string) {
  try {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return isoDate;
    
    // Simple format: "YYYY-MM-DD" or full date
    if (format === 'short') {
      return date.toISOString().split('T')[0];
    }
    return date.toLocaleDateString('fr-FR', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  } catch (e) {
    return isoDate;
  }
});

// Helper: Check if value is not empty (for cleaner conditionals)
handlebarsInstance.registerHelper('notEmpty', function(value: any) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== null && value !== undefined && value !== '';
});

// Helper: Get length of array or string
handlebarsInstance.registerHelper('length', function(value: any) {
  if (Array.isArray(value) || typeof value === 'string') {
    return value.length;
  }
  return 0;
});

// Helper: JSON stringify for debugging
handlebarsInstance.registerHelper('json', function(value: any) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (e) {
    return String(value);
  }
});

// Helper: Uppercase transformation
handlebarsInstance.registerHelper('uppercase', function(str: string) {
  return str ? String(str).toUpperCase() : '';
});

// Helper: Lowercase transformation
handlebarsInstance.registerHelper('lowercase', function(str: string) {
  return str ? String(str).toLowerCase() : '';
});

// Helper: Truncate string to max length
handlebarsInstance.registerHelper('truncate', function(str: string, maxLength: number) {
  if (!str) return '';
  const text = String(str);
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
});

// Helper: Get recent messages (last N messages)
// Usage: {{recentMessages 10}} or {{recentMessages 10 format="json"}}
handlebarsInstance.registerHelper('recentMessages', function(count: number, options: any) {
  // Access messages_array from the root context (passed internally)
  const messagesArray = options?.data?.root?.messages_array;

  if (!messagesArray || !Array.isArray(messagesArray)) {
    return '';
  }

  // Ensure count is a valid positive number
  const limit = typeof count === 'number' && count > 0 ? count : 10;

  // Get the last N messages
  const recentMessages = messagesArray.slice(-limit);

  // Determine output format from hash options (default: 'text')
  const format = options?.hash?.format || 'text';

  if (format === 'json') {
    return JSON.stringify(recentMessages);
  }

  // Text format: "SenderName: content"
  return recentMessages
    .map((msg: { senderType?: string; senderName?: string; content?: string }) => {
      const senderLabel = msg.senderType === 'ai' ? 'Agent' : (msg.senderName || 'Participant');
      return `${senderLabel}: ${msg.content || ''}`;
    })
    .join('\n');
});

/**
 * Render a Handlebars template with the given variables.
 * 
 * This function maintains backward compatibility with the previous simple
 * variable substitution while adding support for Handlebars features:
 * - Conditions: {{#if variable}}...{{/if}}
 * - Loops: {{#each array}}...{{/each}}
 * - Custom helpers: {{default value "fallback"}}, {{jsonParse json}}, etc.
 * 
 * Null and undefined values are converted to empty strings for compatibility.
 * 
 * @param template - The Handlebars template string
 * @param variables - Object containing template variables (strings, arrays, objects, etc.)
 * @returns Rendered template string
 */
export function renderTemplate(
  template: string,
  variables: Record<string, any>,
): string {
  if (!template) {
    return "";
  }

  try {
    // Convert null/undefined values to empty strings for backward compatibility
    const sanitizedVariables: Record<string, any> = {};
    for (const [key, value] of Object.entries(variables)) {
      sanitizedVariables[key] = value ?? '';
    }

    // Compile and execute the template
    const compiledTemplate = handlebarsInstance.compile(template, {
      noEscape: true, // Don't HTML-escape output (we're generating prompts, not HTML)
      strict: false,  // Allow missing variables (return empty string)
    });

    return compiledTemplate(sanitizedVariables);
  } catch (error) {
    // If Handlebars compilation fails, log error and return empty string
    console.error('[Templates] Failed to render template:', error);
    console.error('[Templates] Template:', template.substring(0, 200));
    return "";
  }
}

/**
 * Extract all variable names from a template string.
 * 
 * This extracts simple variable references like {{variable_name}}.
 * It does not extract variables used in complex Handlebars expressions
 * like {{#if}} or {{#each}}, only simple interpolations.
 * 
 * @param template - The template string to analyze
 * @returns Array of unique variable names
 */
export function extractTemplateVariables(template: string): string[] {
  if (!template) {
    return [];
  }

  const found = new Set<string>();
  
  // Extract simple variables using the legacy pattern
  const simpleVarPattern = new RegExp(VARIABLE_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = simpleVarPattern.exec(template)) !== null) {
    if (match[1]) {
      found.add(match[1]);
    }
  }

  // Also try to extract variables from Handlebars AST for more complex templates
  try {
    const ast = Handlebars.parse(template);
    extractVariablesFromAST(ast, found);
  } catch (e) {
    // If parsing fails, we still have the simple pattern matches
    console.debug('[Templates] Could not parse template AST:', e);
  }

  return Array.from(found);
}

/**
 * Recursively extract variable names from Handlebars AST
 */
function extractVariablesFromAST(node: any, found: Set<string>): void {
  if (!node) return;

  // Handle different node types
  if (node.type === 'PathExpression' && node.parts && node.parts.length > 0) {
    // Add the first part of the path (e.g., "user" from "user.name")
    found.add(node.parts[0]);
  }

  // Recursively process child nodes
  if (node.program) {
    extractVariablesFromAST(node.program, found);
  }
  
  if (node.body && Array.isArray(node.body)) {
    for (const child of node.body) {
      extractVariablesFromAST(child, found);
    }
  }

  if (node.params && Array.isArray(node.params)) {
    for (const param of node.params) {
      extractVariablesFromAST(param, found);
    }
  }

  if (node.hash && node.hash.pairs) {
    for (const pair of node.hash.pairs) {
      extractVariablesFromAST(pair.value, found);
    }
  }
}

/**
 * Get the Handlebars instance for advanced use cases
 * (e.g., registering custom helpers from other modules)
 */
export function getHandlebarsInstance(): typeof Handlebars {
  return handlebarsInstance;
}
