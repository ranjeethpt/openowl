/**
 * AtlassianExtractor - Extract content from Jira and Confluence
 *
 * Handles:
 * - Jira issues (/browse/, /jira/)
 * - Confluence pages (/wiki/, /confluence/)
 */

import { BaseSiteExtractor } from '../base.js';

export class AtlassianExtractor extends BaseSiteExtractor {
  get domains() {
    return ['atlassian.net', 'jira.com'];
  }

  get name() {
    return 'Atlassian';
  }

  extract() {
    try {
      const path = window.location.pathname;
      const url = window.location.href;

      // Route based on URL path
      if (path.includes('/browse/') || path.includes('/jira/') || url.includes('selectedIssue=')) {
        return this.extractJiraIssue();
      } else if (path.includes('/wiki/') || path.includes('/confluence/')) {
        return this.extractConfluence();
      } else {
        // Fallback to generic if can't determine type
        return this.buildResult('atlassian_unknown', document.title);
      }
    } catch (error) {
      console.error('Atlassian extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }

  /**
   * Extract Jira issue details
   */
  extractJiraIssue() {
    // Try multiple selectors for issue key (Jira UI varies)
    const issueKey = this.getText('[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"]', 50) ||
                     this.getText('[data-test-id="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"]', 50) ||
                     this.getText('#key-val', 50) ||
                     this.getText('[data-testid="issue.views.field.rich-text.summary"]', 50);

    const title = this.getText('[data-testid="issue.views.issue-base.foundation.summary.heading"]', 300) ||
                  this.getText('#summary-val', 300) ||
                  this.getText('h1', 300);

    const status = this.getText('[data-testid="issue.views.field.status.common.ui.status-lozenge"]', 50) ||
                   this.getText('#status-val', 50) ||
                   this.getText('[data-test-id="issue-field-status"]', 50);

    const description = this.getText('[data-testid="issue.views.field.rich-text.description"]', 400) ||
                        this.getText('#description-val', 400) ||
                        this.getText('.user-content-block', 400);

    const assignee = this.getText('[data-testid="issue.views.field.user.assignee"]', 100) ||
                     this.getText('#assignee-val', 100);

    const content = `
Jira Issue: ${issueKey}

Title: ${title}

Status: ${status}

Assignee: ${assignee || 'Unassigned'}

Description:
${description}
    `.trim();

    return this.buildResult('jira_issue', content, {
      issueKey,
      title,
      status,
      assignee: assignee || 'Unassigned'
    });
  }

  /**
   * Extract Confluence page content
   */
  extractConfluence() {
    const pageTitle = this.getText('#title-text', 300) ||
                      this.getText('[data-testid="content-title"]', 300) ||
                      this.getText('h1', 300);

    const pageContent = this.getText('#main-content', 600) ||
                        this.getText('.wiki-content', 600) ||
                        this.getText('[data-testid="content-body"]', 600);

    const breadcrumbs = this.getMultiple('#breadcrumb-section a', 50).join(' > ');

    const content = `
Confluence Page: ${pageTitle}

Path: ${breadcrumbs || 'N/A'}

Content:
${pageContent}
    `.trim();

    return this.buildResult('confluence_page', content, {
      pageTitle,
      breadcrumbs: breadcrumbs || 'N/A'
    });
  }
}
