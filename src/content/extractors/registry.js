/**
 * Extractor Registry - Central registry for all site extractors
 *
 * To add a new site extractor:
 * 1. Create a new file in sites/ directory
 * 2. Extend BaseSiteExtractor
 * 3. Implement domains getter and extract() method
 * 4. Add an instance to the EXTRACTORS array below
 * 5. Nothing else changes - the registry handles the rest
 *
 * The registry automatically:
 * - Matches URLs to the right extractor
 * - Falls back to GenericExtractor for unknown sites
 * - Handles errors gracefully
 * - Provides debugging utilities
 */

import { GenericExtractor } from './sites/generic.js';

// Import all site-specific extractors
import { GitHubExtractor } from './sites/github.js';
import { AtlassianExtractor } from './sites/atlassian.js';
import { GmailExtractor } from './sites/gmail.js';
import { CalendarExtractor } from './sites/calendar.js';
import { NotionExtractor } from './sites/notion.js';
import { LinearExtractor } from './sites/linear.js';

/**
 * EXTRACTORS - Master list of all site extractors
 * Add new extractor instances here when creating new sites
 */
const EXTRACTORS = [
  new GitHubExtractor(),
  new AtlassianExtractor(),
  new GmailExtractor(),
  new CalendarExtractor(),
  new NotionExtractor(),
  new LinearExtractor(),
];

/**
 * Fallback extractor for unknown sites
 */
const FALLBACK_EXTRACTOR = new GenericExtractor();

/**
 * Get the appropriate extractor for a given URL
 * @param {string} url - URL to match
 * @returns {BaseSiteExtractor} Matched extractor or fallback
 */
export function getExtractor(url) {
  try {
    // Try to find a site-specific extractor
    for (const extractor of EXTRACTORS) {
      if (extractor.canHandle(url)) {
        console.log(`[Registry] Matched ${extractor.name} extractor for ${url}`);
        return extractor;
      }
    }

    // No match found - use generic extractor
    console.log(`[Registry] Using generic extractor for ${url}`);
    return FALLBACK_EXTRACTOR;

  } catch (error) {
    console.error('[Registry] Error matching extractor:', error);
    return FALLBACK_EXTRACTOR;
  }
}

/**
 * Extract content from the current page
 * Automatically selects the right extractor and handles errors
 * @returns {Promise<ExtractedContent>}
 */
export async function extractCurrentPage() {
  const url = window.location.href;

  try {
    // Get the right extractor
    const extractor = getExtractor(url);

    // Extract with timeout protection (2 seconds)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Extraction timeout')), 2000)
    );

    const extractionPromise = Promise.resolve(extractor.extract());

    const result = await Promise.race([extractionPromise, timeoutPromise]);

    console.log(`[Registry] Extracted from ${url}:`, result.type);
    return result;

  } catch (error) {
    console.error('[Registry] Extraction failed:', error);

    // Return minimal fallback on error
    return {
      url: url,
      title: document.title || 'Untitled',
      domain: window.location.hostname,
      content: `(timeout or error: ${error.message})`,
      type: 'error',
      extractionMethod: 'fallback',
      metadata: { error: error.message },
      timestamp: Date.now()
    };
  }
}

/**
 * List all registered extractors (for debugging)
 * @returns {Array<{name: string, domains: string[]}>}
 */
export function listExtractors() {
  return EXTRACTORS.map(extractor => ({
    name: extractor.name,
    domains: extractor.domains
  }));
}

/**
 * Test which extractor would handle a given URL (for debugging)
 * @param {string} url
 * @returns {string} Extractor name
 */
export function testUrl(url) {
  const extractor = getExtractor(url);
  return extractor.name;
}
