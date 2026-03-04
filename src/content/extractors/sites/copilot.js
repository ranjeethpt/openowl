/**
 * CopilotExtractor - Extract content from Microsoft Copilot chat interface
 *
 * Handles:
 * - copilot.microsoft.com (Copilot chat)
 * - Extracts first human message from conversation
 * - Skips settings, account, and empty chat pages
 */

import { BaseSiteExtractor } from '../base.js';

export class CopilotExtractor extends BaseSiteExtractor {
  get domains() {
    return ['copilot.microsoft.com', 'www.copilot.microsoft.com'];
  }

  get name() {
    return 'Copilot';
  }

  extract() {
    try {
      const path = window.location.pathname;

      // Skip non-chat pages
      if (path.includes('/settings') ||
          path.includes('/account') ||
          path.includes('/login') ||
          path === '/') {
        return this.buildFallbackResult('not a chat page');
      }

      // Try to extract first user message
      // Copilot uses various selectors for user messages
      let userMessages = this.getMultiple('[data-message-author-role="user"]', 200);

      if (userMessages.length === 0) {
        userMessages = this.getMultiple('[class*="user-message"]', 200);
      }

      if (userMessages.length === 0) {
        userMessages = this.getMultiple('[class*="UserMessage"]', 200);
      }

      if (userMessages.length === 0) {
        userMessages = this.getMultiple('[aria-label*="user"]', 200);
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
                    this.getText('[class*="conversation-title"]', 200) ||
                    this.getText('[class*="chat-title"]', 200);

      if (title && title !== 'Copilot' && title !== 'New chat') {
        const content = `Chat: ${title}`;
        return this.buildResult('ai_chat', content);
      }

      // No content found
      return this.buildFallbackResult('new chat, no messages yet');

    } catch (error) {
      console.error('Copilot extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }
}
