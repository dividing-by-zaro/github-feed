import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache compiled templates
const templateCache = new Map<string, Handlebars.TemplateDelegate>();

/**
 * Load and compile a prompt template from a markdown file
 * @param category - The prompt category (e.g., 'classifier', 'reports')
 * @param name - The prompt name (e.g., 'pr-grouping-system')
 * @returns Compiled Handlebars template
 */
function loadTemplate(category: string, name: string): Handlebars.TemplateDelegate {
  const cacheKey = `${category}/${name}`;

  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey)!;
  }

  const filePath = path.join(__dirname, category, `${name}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const template = Handlebars.compile(content);

  templateCache.set(cacheKey, template);
  return template;
}

/**
 * Load a prompt and render it with the given context
 * @param category - The prompt category
 * @param name - The prompt name
 * @param context - Variables to interpolate into the template
 * @returns Rendered prompt string
 */
export function renderPrompt(
  category: string,
  name: string,
  context: Record<string, unknown> = {}
): string {
  const template = loadTemplate(category, name);
  return template(context).trim();
}

/**
 * Load a system prompt (typically static, no variables)
 */
export function loadSystemPrompt(category: string, name: string): string {
  return renderPrompt(category, name);
}

/**
 * Load and render a user prompt with variables
 */
export function loadUserPrompt(
  category: string,
  name: string,
  context: Record<string, unknown>
): string {
  return renderPrompt(category, name, context);
}

// Register useful Handlebars helpers

// Helper for conditional blocks
Handlebars.registerHelper('if_eq', function(this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  if (a === b) {
    return options.fn(this);
  }
  return options.inverse(this);
});

// Helper for greater than comparison
Handlebars.registerHelper('if_gt', function(this: unknown, a: number, b: number, options: Handlebars.HelperOptions) {
  if (a > b) {
    return options.fn(this);
  }
  return options.inverse(this);
});
