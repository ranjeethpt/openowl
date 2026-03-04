/**
 * ChatGPTExtractor - Extract content from ChatGPT chat interface
 *
 * Handles:
 * - Chat conversations with message history
 * - Extracts first human message from conversation
 * - Skips settings, account, and empty chat pages
 */

import { BaseSiteExtractor } from '../base.js';

export class ChatGPTExtractor extends BaseSiteExtractor {
  get domains() {
    return ['chat.openai.com', 'chatgpt.com'];
  }

  get name() {
    return 'ChatGPT';
  }

  extract() {
    try {
      const path = window.location.pathname;

      // Skip non-chat pages
      if (path.includes('/settings') ||
          path.includes('/account') ||
          path.includes('/auth') ||
          path === '/') {
        return this.buildFallbackResult('not a chat page');
      }

      // Try to extract first user message
      // ChatGPT uses data-message-author-role="user" for user messages
      const userMessages = this.getMultiple('[data-message-author-role="user"]', 200);

      if (userMessages.length > 0 && userMessages[0].trim()) {
        const message = userMessages[0].substring(0, 200);
        const content = `Asked: ${message}`;

        return this.buildResult('ai_chat', content, {
          messageCount: userMessages.length
        });
      }

      // Fallback to conversation title from sidebar or header
      const title = this.getText('h1', 200) ||
                    this.getText('[class*="conversation-title"]', 200);

      if (title && title !== 'ChatGPT' && title !== 'New chat') {
        const content = `Chat: ${title}`;
        return this.buildResult('ai_chat', content);
      }

      // No content found
      return this.buildFallbackResult('new chat, no messages yet');

    } catch (error) {
      console.error('ChatGPT extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }
}
