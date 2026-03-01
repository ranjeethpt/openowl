/**
 * GitHubExtractor - Extract content from GitHub pages
 *
 * Handles:
 * - Pull requests (/pull/)
 * - Issues (/issues/)
 * - Code files (/blob/)
 * - Repositories (default)
 */

import { BaseSiteExtractor } from '../base.js';

export class GitHubExtractor extends BaseSiteExtractor {
  get domains() {
    return ['github.com'];
  }

  get name() {
    return 'GitHub';
  }

  extract() {
    try {
      const path = window.location.pathname;

      // Route based on URL path
      if (path.includes('/pull/')) {
        return this.extractPR();
      } else if (path.includes('/issues/')) {
        return this.extractIssue();
      } else if (path.includes('/blob/')) {
        return this.extractCodeFile();
      } else {
        return this.extractRepo();
      }
    } catch (error) {
      console.error('GitHub extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }

  /**
   * Extract Pull Request details
   */
  extractPR() {
    const title = this.getText('.gh-header-title', 500) ||
                  this.getText('bdi.js-issue-title', 500);

    const description = this.getText('.comment-body', 300);

    const status = this.getText('.State', 50) ||
                   this.getText('[data-hovercard-type="pull_request"] .State', 50);

    const filesChanged = this.getMultiple('.file-info', 50).join(', ');

    const reviewers = this.getMultiple('[data-hovercard-type="user"]', 50)
      .slice(0, 5)
      .join(', ');

    const content = `
PR: ${title}

Status: ${status}

Description:
${description}

Files changed: ${filesChanged || 'loading...'}

Reviewers: ${reviewers || 'none yet'}
    `.trim();

    return this.buildResult('github_pr', content, {
      title,
      status,
      filesChanged: filesChanged || 'loading',
      reviewers: reviewers || 'none'
    });
  }

  /**
   * Extract Issue details
   */
  extractIssue() {
    const title = this.getText('.gh-header-title', 500) ||
                  this.getText('bdi.js-issue-title', 500);

    const body = this.getText('.comment-body', 400);

    const status = this.getText('.State', 50);

    const labels = this.getMultiple('.IssueLabel', 30).join(', ');

    const content = `
Issue: ${title}

Status: ${status}

Labels: ${labels || 'none'}

Description:
${body}
    `.trim();

    return this.buildResult('github_issue', content, {
      title,
      status,
      labels: labels || 'none'
    });
  }

  /**
   * Extract code file content
   */
  extractCodeFile() {
    const filename = this.getText('.final-path', 200) ||
                     this.getText('[data-path]', 200);

    // Get first 50 lines of code
    const codeLines = this.getMultiple('.blob-code-inner', 200).slice(0, 50);

    const content = `
File: ${filename}

Code (first 50 lines):
${codeLines.join('\n')}
    `.trim();

    return this.buildResult('github_code', content, {
      filename,
      lines: codeLines.length
    });
  }

  /**
   * Extract repository overview
   */
  extractRepo() {
    const repoName = this.getText('[itemprop="name"]', 200) ||
                     this.getText('.repo-title', 200);

    const description = this.getText('[itemprop="about"]', 300) ||
                        this.getText('.repository-description', 300);

    const readme = this.getText('#readme article', 500) ||
                   this.getText('.markdown-body', 500);

    const topics = this.getMultiple('[data-octo-click="topic"]', 30).join(', ');

    const content = `
Repository: ${repoName}

Description: ${description}

Topics: ${topics || 'none'}

README (first 500 chars):
${readme}
    `.trim();

    return this.buildResult('github_repo', content, {
      repoName,
      description,
      topics: topics || 'none'
    });
  }
}
