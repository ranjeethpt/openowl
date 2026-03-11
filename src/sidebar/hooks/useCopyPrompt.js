import { getAllTemplates } from '../../prompts/templates.js';
import { getPrompt } from '../../prompts/registry.js';

/**
 * Hook for copying prompt to clipboard
 * Unifies copy logic from Ask.jsx and Today.jsx
 *
 * @param {Function} showToast - Toast function from useToast hook
 * @returns {Function} copyPromptForTemplate - Function to copy a prompt
 */
export function useCopyPrompt(showToast) {
  /**
   * Copy prompt to clipboard for a given template
   *
   * @param {Object|string} templateOrKey - Template object or template key string
   * @param {string} successMessage - Optional success message (default: generic message)
   */
  async function copyPromptForTemplate(templateOrKey, successMessage = 'Prompt copied — paste into any AI chat') {
    try {
      let template;

      // Handle both template object and template key
      if (typeof templateOrKey === 'string') {
        // It's a template key, need to fetch the template
        const allTemplates = await getAllTemplates();
        template = allTemplates.find(t => t.key === templateOrKey);

        if (!template) {
          console.error(`Template ${templateOrKey} not found`);
          return;
        }
      } else {
        // It's already a template object
        template = templateOrKey;
      }

      // Gather data using the template's gather function
      const gatherData = await template.gather();

      // Check if data is empty
      if (gatherData.isEmpty) {
        showToast('No data to copy for this time range', true);
        return;
      }

      // Build the prompt using getPrompt
      const promptResult = getPrompt(template.prompt, gatherData);

      // Combine system prompt and user prompt into one readable string
      const combinedPrompt = promptResult.user
        ? `${promptResult.system}\n\n${promptResult.user}`
        : promptResult.system;

      // Copy to clipboard
      await navigator.clipboard.writeText(combinedPrompt);

      // Show success toast
      showToast(successMessage);
    } catch (error) {
      console.error('Failed to copy prompt:', error);
      showToast('Could not copy — try again', true);
    }
  }

  return { copyPromptForTemplate };
}
