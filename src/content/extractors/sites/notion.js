/**
 * NotionExtractor - Extract content from Notion pages
 *
 * Handles:
 * - Regular pages
 * - Database views
 */

import { BaseSiteExtractor } from '../base.js';

export class NotionExtractor extends BaseSiteExtractor {
  get domains() {
    return ['notion.so', 'notion.com'];
  }

  get name() {
    return 'Notion';
  }

  extract() {
    try {
      // Check if we're in a database view
      if (this.isDatabaseView()) {
        return this.extractDatabase();
      }

      // Otherwise extract as regular page
      return this.extractPage();
    } catch (error) {
      console.error('Notion extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }

  /**
   * Check if current view is a database (table/board/list)
   */
  isDatabaseView() {
    return !!document.querySelector('[data-block-id*="collection"]') ||
           !!document.querySelector('.notion-table-view') ||
           !!document.querySelector('.notion-board-view') ||
           !!document.querySelector('.notion-list-view');
  }

  /**
   * Extract regular Notion page
   */
  extractPage() {
    // Page title (in edit mode or view mode)
    const title = this.getText('[placeholder="Untitled"]', 300) ||
                  this.getText('[data-content-editable-leaf="true"]', 300) ||
                  this.getText('h1', 300) ||
                  document.title;

    // Page content (first 800 chars from main content area)
    const content = this.getText('[data-block-id] [data-content-editable-root="true"]', 800) ||
                    this.getText('.notion-page-content', 800) ||
                    this.getText('[role="textbox"]', 800);

    // Get all text blocks (alternative approach)
    if (!content || content.length < 50) {
      const blocks = this.getMultiple('[data-block-id]', 200).slice(0, 10);
      const combinedContent = blocks.join('\n\n');

      return this.buildResult('notion_page', `${title}\n\n${combinedContent}`, {
        title,
        blockCount: blocks.length
      });
    }

    return this.buildResult('notion_page', `${title}\n\n${content}`, {
      title
    });
  }

  /**
   * Extract database view (table/board/list)
   */
  extractDatabase() {
    const title = this.getText('[placeholder="Untitled"]', 300) ||
                  this.getText('h1', 300) ||
                  document.title;

    // Try to extract visible row/card titles
    const rowTitles = this.getMultiple('[data-block-id] a', 100).slice(0, 15);

    // Alternative: try getting cell content
    if (rowTitles.length === 0) {
      const cells = this.getMultiple('.notion-table-view-cell', 100).slice(0, 15);
      if (cells.length > 0) {
        const content = `${title}\n\nDatabase view with ${cells.length} visible items:\n\n${cells.join('\n')}`;
        return this.buildResult('notion_database', content, {
          title,
          itemCount: cells.length
        });
      }
    }

    const content = `${title}\n\nDatabase view with ${rowTitles.length} visible items:\n\n${rowTitles.join('\n')}`;

    return this.buildResult('notion_database', content, {
      title,
      itemCount: rowTitles.length
    });
  }
}
