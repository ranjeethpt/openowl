/**
 * Intent Detection - Match user questions to templates
 */
import { TEMPLATES } from '../prompts/templates.js';

export function detectTemplate(question) {
  const q = question.toLowerCase().trim();

  for (const [key, template] of Object.entries(TEMPLATES)) {
    if (template.triggers.some(t => q.includes(t))) {
      return { key, template };
    }
  }

  return null; // falls through to general ask
}
