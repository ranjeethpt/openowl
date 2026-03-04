/**
 * GeminiExtractor - Extract content from Gemini and AI Studio chat interfaces
 *
 * Handles:
 * - gemini.google.com (Gemini chat)
 * - aistudio.google.com (AI Studio)
 * - Extracts first human message from conversation
 * - Skips settings, account, and empty chat pages
 */

import { BaseSiteExtractor } from '../base.js';

export class GeminiExtractor extends BaseSiteExtractor {
  get domains() {
    return ['gemini.google.com', 'aistudio.google.com'];
  }

  get name() {
    return 'Gemini';
  }

  extract() {
    try {
      const path = window.location.pathname;

      // Skip non-chat pages
      if (path.includes('/settings') ||
          path.includes('/account') ||
          path.includes('/faq') ||
          path === '/app' ||
          path === '/') {
        return this.buildFallbackResult('not a chat page');
      }

      // Try to extract first user message
      // Gemini uses various selectors for user messages
      let userMessages = this.getMultiple('[data-message-author-role="user"]', 200);

      // Fallback selectors for different Gemini versions
      if (userMessages.length === 0) {
        userMessages = this.getMultiple('message-content[role="user"]', 200);
      }

      if (userMessages.length === 0) {
        userMessages = this.getMultiple('.user-message', 200);
      }

      if (userMessages.length > 0 && userMessages[0].trim()) {
        const message = userMessages[0].substring(0, 200);
        const content = `Asked: ${message}`;

        return this.buildResult('ai_chat', content, {
          messageCount: userMessages.length
        });
      }

      // Fallback to conversation title
      const title = this.getText('h1', 200) ||
                    this.getText('[class*="chat-title"]', 200) ||
                    this.getText('[class*="conversation-name"]', 200);

      if (title && title !== 'Gemini' && title !== 'New chat' && title !== 'AI Studio') {
        const content = `Chat: ${title}`;
        return this.buildResult('ai_chat', content);
      }

      // No content found
      return this.buildFallbackResult('new chat, no messages yet');

    } catch (error) {
      console.error('Gemini extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }
}
