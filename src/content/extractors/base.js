/**
 * BaseSiteExtractor - Contract for all site-specific extractors
 *
 * Every site extractor extends this base class and implements:
 * - domains getter: string[] of domains this extractor handles
 * - name getter: string name of the site
 * - extract(): ExtractedContent method that never throws
 *
 * Optional overrides:
 * - canHandle(url): boolean for complex URL matching logic
 *
 * Helper methods provided:
 * - getText(), getMultiple(), cleanText(), buildResult()
 */

export class BaseSiteExtractor {
  /**
   * REQUIRED: List of domains this extractor handles
   * @returns {string[]} e.g. ['github.com']
   */
  get domains() {
    throw new Error('Must implement domains getter');
  }

  /**
   * REQUIRED: Name of the site
   * @returns {string} e.g. 'GitHub'
   */
  get name() {
    throw new Error('Must implement name getter');
  }

  /**
   * REQUIRED: Extract content from current page
   * Must NEVER throw - always return something, even if minimal
   * @returns {ExtractedContent}
   */
  extract() {
    throw new Error('Must implement extract() method');
  }

  /**
   * OPTIONAL: Check if this extractor can handle the given URL
   * Default implementation checks if URL domain matches any in this.domains
   * Override for complex URL matching logic
   * @param {string} url
   * @returns {boolean}
   */
  canHandle(url) {
    try {
      const urlObj = new URL(url);
      return this.domains.some(domain =>
        urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
      );
    } catch {
      return false;
    }
  }

  // ============================================
  // Helper Methods (provided by base class)
  // ============================================

  /**
   * Safely get text from a selector with fallback
   * @param {string} selector - CSS selector
   * @param {number} maxLength - Max characters to return
   * @returns {string}
   */
  getText(selector, maxLength = Infinity) {
    try {
      const element = document.querySelector(selector);
      if (!element) return '';

      const text = this.cleanText(element.innerText || element.textContent || '');
      return maxLength < Infinity ? text.substring(0, maxLength) : text;
    } catch {
      return '';
    }
  }

  /**
   * Get text from multiple elements matching selector
   * @param {string} selector - CSS selector
   * @param {number} maxLength - Max characters per item
   * @returns {string[]}
   */
  getMultiple(selector, maxLength = Infinity) {
    try {
      const elements = document.querySelectorAll(selector);
      return Array.from(elements).map(el => {
        const text = this.cleanText(el.innerText || el.textContent || '');
        return maxLength < Infinity ? text.substring(0, maxLength) : text;
      }).filter(text => text.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Clean text by stripping HTML and collapsing whitespace
   * @param {string} text
   * @returns {string}
   */
  cleanText(text) {
    if (!text) return '';

    // Remove HTML tags if any
    text = text.replace(/<[^>]*>/g, '');

    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Build standardized ExtractedContent result
   * @param {string} type - Content type (e.g. 'github_pr', 'gmail_email')
   * @param {string} content - Main content text (max 2000 chars)
   * @param {Object} metadata - Optional additional data
   * @returns {ExtractedContent}
   */
  buildResult(type, content, metadata = {}) {
    return {
      url: window.location.href,
      title: document.title || 'Untitled',
      domain: window.location.hostname,
      content: this.cleanText(content).substring(0, 2000),
      type: type,
      extractionMethod: 'site_specific',
      metadata: metadata,
      timestamp: Date.now()
    };
  }

  /**
   * Build fallback result when extraction fails
   * @param {string} reason - Why extraction failed
   * @returns {ExtractedContent}
   */
  buildFallbackResult(reason = 'extraction_failed') {
    return {
      url: window.location.href,
      title: document.title || 'Untitled',
      domain: window.location.hostname,
      content: `Could not extract content: ${reason}`,
      type: 'fallback',
      extractionMethod: 'fallback',
      metadata: { reason },
      timestamp: Date.now()
    };
  }
}

/**
 * @typedef {Object} ExtractedContent
 * @property {string} url - Full URL of the page
 * @property {string} title - Page title
 * @property {string} domain - Domain name
 * @property {string} content - Extracted content (max 2000 chars)
 * @property {string} type - Content type (e.g. 'github_pr', 'gmail_email')
 * @property {string} extractionMethod - 'site_specific' | 'generic' | 'fallback'
 * @property {Object} metadata - Optional extra fields
 * @property {number} timestamp - Extraction timestamp
 */
