/**
 * ClaudeExtractor - Extract content from Claude.ai chat interface
 *
 * Handles:
 * - Chat conversations with message history
 * - Extracts first human message from conversation
 * - Skips settings, account, and empty chat pages
 */

import { BaseSiteExtractor } from '../base.js';

export class ClaudeExtractor extends BaseSiteExtractor {
  get domains() {
    return ['claude.ai'];
  }

  get name() {
    return 'Claude';
  }

  extract() {
    try {
      const path = window.location.pathname;

      // Skip non-chat pages
      if (path.includes('/settings') ||
          path.includes('/account') ||
          path.includes('/login') ||
          path === '/' ||
          path === '/new') {
        return this.buildFallbackResult('not a chat page');
      }

      // Try to extract first human message
      const userMessages = this.getMultiple('.font-user-message', 200);

      if (userMessages.length > 0 && userMessages[0].trim()) {
        const message = userMessages[0].substring(0, 200);
        const content = `Asked: ${message}`;

        return this.buildResult('ai_chat', content, {
          messageCount: userMessages.length
        });
      }

      // Fallback to conversation title
      const title = this.getText('[data-testid="conversation-title"]', 200) ||
                    this.getText('h1', 200);

      if (title && title !== 'Claude' && title !== 'New chat') {
        const content = `Chat: ${title}`;
        return this.buildResult('ai_chat', content);
      }

      // No content found
      return this.buildFallbackResult('new chat, no messages yet');

    } catch (error) {
      console.error('Claude extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }
}
