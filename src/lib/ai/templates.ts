const VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

export function renderTemplate(
  template: string,
  variables: Record<string, string | null | undefined>,
): string {
  if (!template) {
    return "";
  }

  return template.replace(VARIABLE_PATTERN, (_, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  });
}

export function extractTemplateVariables(template: string): string[] {
  if (!template) {
    return [];
  }

  const found = new Set<string>();
  const iterator = new RegExp(VARIABLE_PATTERN.source, "g");

  let match: RegExpExecArray | null;
  while ((match = iterator.exec(template)) !== null) {
    if (match[1]) {
      found.add(match[1]);
    }
  }
  return Array.from(found);
}
