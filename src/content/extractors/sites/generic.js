/**
 * GenericExtractor - Fallback for all unknown sites
 *
 * Hybrid extraction strategy with Readability.js:
 * Layer 1: Try semantic selectors (article, main, etc.) - FAST
 * Layer 1.5: Mozilla Readability.js for article-heavy sites - ACCURATE
 * Layer 2: Clone body and remove noise (nav, footer, ads, etc.) - FALLBACK
 * Layer 3: Absolute fallback - document.title only
 */

import {BaseSiteExtractor} from '../base.js';
import { Readability, isProbablyReaderable } from '@mozilla/readability';

export class GenericExtractor extends BaseSiteExtractor {
  get domains() {
    return []; // Never matches directly - used as fallback only
  }

  get name() {
    return 'Generic';
  }

  /**
   * Override canHandle to always return false
   * This extractor is only used as fallback by registry
   */
  canHandle(url) {
    return false;
  }

  /**
   * Hybrid extraction strategy with Readability.js
   */
  extract() {
    try {
      // Layer 1: Try semantic content selectors (fast path)
      const layer1 = this.trySemanticSelectors();
      if (layer1.length >= 100) {
        console.log('[GenericExtractor] Layer 1 (semantic) succeeded:', layer1.length, 'chars');
        return this.buildResult('generic_semantic', layer1, { layer: 1 });
      }

      // Layer 1.5: Try Readability.js for article-heavy sites
      const layer15 = this.tryReadability();
      if (layer15.length >= 100) {
        console.log('[GenericExtractor] Layer 1.5 (Readability) succeeded:', layer15.length, 'chars');
        return this.buildResult('generic_readability', layer15, {
          layer: 1.5,
          method: 'mozilla_readability'
        });
      }

      // Layer 2: Body minus noise
      const layer2 = this.tryBodyMinusNoise();
      if (layer2.length >= 50) {
        console.log('[GenericExtractor] Layer 2 (body minus noise) succeeded:', layer2.length, 'chars');
        return this.buildResult('generic_body', layer2, { layer: 2 });
      }

      // Layer 3: Absolute fallback - title only
      const layer3 = document.title || 'Untitled page';
      console.log('[GenericExtractor] Layer 3 (fallback) used');
      return this.buildResult('generic_fallback', layer3, { layer: 3 });

    } catch (error) {
      console.error('Generic extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }

  /**
   * Layer 1: Try semantic content selectors in order
   * Returns text from first selector with 100+ chars
   */
  trySemanticSelectors() {
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.markdown-body',
      '.content',
      '#content',
      '.post',
      '.entry-content',
      'section'
    ];

    for (const selector of selectors) {
      const text = this.getText(selector);
      if (text.length >= 100) {
        return text;
      }
    }

    return '';
  }

  /**
   * Layer 1.5: Try Mozilla Readability.js
   * Uses the same algorithm as Firefox Reader View
   * Only runs if page is probably an article (fast pre-check)
   */
  tryReadability() {
    try {
      // Quick check: Is this probably an article?
      // This is very fast and prevents wasted processing on non-article pages
      if (!isProbablyReaderable(document)) {
        console.log('[GenericExtractor] isProbablyReaderable: false, skipping Readability');
        return '';
      }

      // Clone document to avoid modifying the real DOM
      const documentClone = document.cloneNode(true);

      // Run Readability algorithm
      const reader = new Readability(documentClone);
      const article = reader.parse();

      if (!article) {
        console.log('[GenericExtractor] Readability.parse() returned null');
        return '';
      }

      // Use textContent (plain text) rather than HTML content
      const text = article.textContent || '';

      console.log('[GenericExtractor] Readability extracted:', {
        title: article.title,
        byline: article.byline,
        length: text.length,
        excerpt: article.excerpt?.substring(0, 100)
      });

      return this.cleanText(text);

    } catch (error) {
      console.warn('[GenericExtractor] Readability failed:', error.message);
      return '';
    }
  }

  /**
   * Layer 2: Clone body and remove all noise elements
   * Enhanced with additional noise patterns and comment filtering
   */
  tryBodyMinusNoise() {
    try {
      // Clone body to avoid modifying DOM
      const bodyClone = document.body.cloneNode(true);

      // Comprehensive noise removal
      const noiseSelectors = [
        // Navigation & Structure
        'nav', 'header', 'footer', 'aside',
        '.sidebar', '.menu', '.navigation', '.navbar', '.topbar', '.breadcrumb',
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',

        // Ads & Tracking
        '.ad', '.ads', '.advertisement', '.sponsored', '.promo', '.promotion',
        '[class*="ad-"]', '[id*="ad-"]', '[class*="google_ads"]',
        'iframe[src*="ads"]', 'iframe[src*="doubleclick"]',

        // Popups & Modals
        '.modal', '.popup', '.overlay', '.lightbox', '.dialog',
        '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]',

        // Cookie & Privacy banners
        '.cookie', '.cookie-banner', '.cookie-notice', '.gdpr', '.privacy-banner',
        '[class*="cookie"]', '[id*="cookie"]', '[class*="consent"]',
        '[class*="banner"]', '[id*="banner"]',

        // Comments & Social
        '.comments', '.comment-section', '#comments', '.disqus',
        '.social-share', '.share-buttons', '.social-media',
        '[class*="comment"]', '[class*="social"]', '[class*="share"]',

        // Scripts & Hidden content
        'script', 'style', 'noscript', 'link', 'meta',
        '.hidden', '[hidden]', '[style*="display: none"]', '[style*="visibility: hidden"]',

        // Widgets & Embeds
        'iframe', 'embed', 'object', 'svg',
        '.widget', '.plugin', '.embed',

        // Related content & suggestions
        '.related', '.recommended', '.suggestions', '.trending',
        '[class*="related"]', '[class*="recommend"]', '[class*="suggestion"]'
      ];

      // Remove all noise elements
      for (const selector of noiseSelectors) {
        try {
          const elements = bodyClone.querySelectorAll(selector);
          elements.forEach(el => el.remove());
        } catch (e) {
          // Invalid selector, skip
          console.debug('Invalid selector:', selector);
        }
      }

      // Remove elements with very low text/tag ratio (likely noise)
      const allElements = bodyClone.querySelectorAll('*');
      allElements.forEach(el => {
        if (el.children.length > 0) {
          const text = (el.textContent || '').trim();
          const tags = el.querySelectorAll('*').length;
          // If there are more tags than 10 chars per tag, likely navigation/ads
          if (tags > 0 && text.length / tags < 10) {
            el.remove();
          }
        }
      });

      // Get remaining text
      let text = this.cleanText(bodyClone.innerText || bodyClone.textContent || '');

      // Additional text cleanup: remove common noise patterns
      text = text
        .replace(/^(Skip to|Jump to|Go to) (main )?content/gmi, '') // Skip links
        .replace(/^(Search|Menu|Navigation|Home|About|Contact|Privacy Policy)/gmi, '') // Common nav text
        .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
        .trim();

      return text;

    } catch (error) {
      console.error('Layer 2 extraction failed:', error);
      return '';
    }
  }
}
