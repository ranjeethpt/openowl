/**
 * GenericExtractor - Fallback for all unknown sites
 *
 * 3-layer extraction strategy:
 * Layer 1: Try semantic selectors (article, main, etc.)
 * Layer 2: Clone body and remove noise (nav, footer, ads, etc.)
 * Layer 3: Absolute fallback - document.title only
 */

import {BaseSiteExtractor} from '../base.js';

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
   * 3-layer extraction strategy
   */
  extract() {
    try {
      // Layer 1: Try semantic content selectors
      const layer1 = this.trySemanticSelectors();
      if (layer1.length >= 100) {
        return this.buildResult('generic_semantic', layer1, { layer: 1 });
      }

      // Layer 2: Body minus noise
      const layer2 = this.tryBodyMinusNoise();
      if (layer2.length >= 50) {
        return this.buildResult('generic_body', layer2, { layer: 2 });
      }

      // Layer 3: Absolute fallback - title only
      const layer3 = document.title || 'Untitled page';
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
   * Layer 2: Clone body and remove all noise elements
   */
  tryBodyMinusNoise() {
    try {
      // Clone body to avoid modifying DOM
      const bodyClone = document.body.cloneNode(true);

      // Remove noise elements
      const noiseSelectors = [
        'nav',
        'header',
        'footer',
        'aside',
        '.sidebar',
        '.menu',
        '.navigation',
        'script',
        'style',
        'noscript',
        'iframe',
        'svg',
        '.ad',
        '.advertisement',
        '.cookie',
        '.cookie-banner',
        '.modal',
        '.popup',
        '[class*="cookie"]',
        '[class*="banner"]',
        '[id*="cookie"]'
      ];

      for (const selector of noiseSelectors) {
        const elements = bodyClone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      }

      // Get remaining text
      return this.cleanText(bodyClone.innerText || bodyClone.textContent || '');

    } catch (error) {
      console.error('Layer 2 extraction failed:', error);
      return '';
    }
  }
}
