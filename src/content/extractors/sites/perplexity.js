/**
 * PerplexityExtractor - Extract content from Perplexity.ai chat interface
 *
 * Handles:
 * - Search/chat conversations
 * - Extracts first user query from conversation
 * - Skips settings, account, and empty pages
 */

import { BaseSiteExtractor } from '../base.js';

export class PerplexityExtractor extends BaseSiteExtractor {
  get domains() {
    return ['perplexity.ai', 'www.perplexity.ai'];
  }

  get name() {
    return 'Perplexity';
  }

  extract() {
    try {
      const path = window.location.pathname;

      // Skip non-chat pages
      if (path.includes('/settings') ||
          path.includes('/account') ||
          path.includes('/pro') ||
          path === '/') {
        return this.buildFallbackResult('not a chat page');
      }

      // Try to extract user query
      // Perplexity shows user queries in thread structure
      let userMessages = this.getMultiple('[class*="Query"]', 200);

      if (userMessages.length === 0) {
        userMessages = this.getMultiple('[class*="user"]', 200);
      }

      if (userMessages.length === 0) {
        userMessages = this.getMultiple('[class*="question"]', 200);
      }

      if (userMessages.length > 0 && userMessages[0].trim()) {
        const message = userMessages[0].substring(0, 200);
        const content = `Asked: ${message}`;

        return this.buildResult('ai_chat', content, {
          messageCount: userMessages.length
        });
      }

      // Fallback to page title or thread title
      const title = this.getText('h1', 200) ||
                    this.getText('[class*="thread-title"]', 200);

      if (title && title !== 'Perplexity' && title !== 'New Thread') {
        const content = `Chat: ${title}`;
        return this.buildResult('ai_chat', content);
      }

      // No content found
      return this.buildFallbackResult('new chat, no messages yet');

    } catch (error) {
      console.error('Perplexity extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }
}
