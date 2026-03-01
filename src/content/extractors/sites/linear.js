/**
 * LinearExtractor - Extract content from Linear
 *
 * Handles:
 * - Issue detail view
 * - Board/list views
 */

import { BaseSiteExtractor } from '../base.js';

export class LinearExtractor extends BaseSiteExtractor {
  get domains() {
    return ['linear.app'];
  }

  get name() {
    return 'Linear';
  }

  extract() {
    try {
      // Check URL to determine view type
      const path = window.location.pathname;

      if (path.includes('/issue/')) {
        return this.extractIssue();
      } else {
        return this.extractBoardView();
      }
    } catch (error) {
      console.error('Linear extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }

  /**
   * Extract issue details
   */
  extractIssue() {
    // Issue identifier (e.g., ENG-456)
    const issueId = this.getText('[data-entity-id]', 50) ||
                    this.getText('.issue-identifier', 50) ||
                    window.location.pathname.split('/').pop();

    // Issue title
    const title = this.getText('[data-key="title"]', 300) ||
                  this.getText('h1', 300) ||
                  this.getText('[placeholder="Issue title"]', 300);

    // Status
    const status = this.getText('[data-key="state"]', 50) ||
                   this.getText('.status-button', 50);

    // Priority
    const priority = this.getText('[data-key="priority"]', 50) ||
                     this.getText('.priority-icon', 50);

    // Description
    const description = this.getText('[data-key="description"]', 400) ||
                        this.getText('.ProseMirror', 400);

    // Assignee
    const assignee = this.getText('[data-key="assignee"]', 100);

    const content = `
Linear Issue: ${issueId}

Title: ${title}

Status: ${status || 'Unknown'}

Priority: ${priority || 'None'}

Assignee: ${assignee || 'Unassigned'}

Description:
${description || 'No description'}
    `.trim();

    return this.buildResult('linear_issue', content, {
      issueId,
      title,
      status: status || 'Unknown',
      priority: priority || 'None',
      assignee: assignee || 'Unassigned'
    });
  }

  /**
   * Extract board/list view with visible issues
   */
  extractBoardView() {
    // Get visible issue titles and identifiers
    const issues = [];

    // Try to find issue cards
    const issueCards = document.querySelectorAll('[data-entity-type="issue"]');

    if (issueCards.length > 0) {
      issueCards.forEach((card, index) => {
        if (index < 10) { // Limit to first 10 visible issues
          const id = this.cleanText(card.querySelector('[data-key="identifier"]')?.textContent || '');
          const title = this.cleanText(card.querySelector('[data-key="title"]')?.textContent || '');
          const status = this.cleanText(card.querySelector('[data-key="state"]')?.textContent || '');

          if (id && title) {
            issues.push(`${id}: ${title}${status ? ` [${status}]` : ''}`);
          } else if (title) {
            issues.push(title);
          }
        }
      });
    }

    // Fallback: get any visible issue-like content
    if (issues.length === 0) {
      const issueTitles = this.getMultiple('[role="button"] h3', 100).slice(0, 10);
      issues.push(...issueTitles);
    }

    const content = issues.length > 0
      ? `Linear board/list view - ${issues.length} visible issues:\n\n${issues.join('\n')}`
      : 'Linear board/list view (issues loading)';

    return this.buildResult('linear_board', content, {
      issueCount: issues.length
    });
  }
}
