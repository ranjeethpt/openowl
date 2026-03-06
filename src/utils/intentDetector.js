/**
 * Intent Detection - Match user questions to templates
 */
import { getAllTemplates } from '../prompts/templates.js';

export async function detectTemplate(question) {
  if (!question) return null;

  const q = question.toLowerCase().trim();

  // Get all templates (built-in + custom)
  const allTemplates = await getAllTemplates();

  for (const template of allTemplates) {
    // For built-in templates, use the key; for custom, use the id
    const key = template.key || template.id;

    if (template.triggers && template.triggers.some(t => q.includes(t))) {
      return { key, template };
    }
  }

  return null; // falls through to general ask
}
