/**
 * Content script for OpenOwl
 * Runs on all pages to track visits and extract content using the registry system
 */

import { extractCurrentPage } from './extractors/registry.js';

console.log('OpenOwl content script loaded');

// Debounce timer for page logging
let logTimer = null;
const LOG_DEBOUNCE_MS = 500;

/**
 * Log current page visit to background using registry extractor
 */
async function logPageVisit() {
  // Skip chrome:// and extension URLs
  if (window.location.href.startsWith('chrome://') ||
      window.location.href.startsWith('chrome-extension://') ||
      window.location.href.startsWith('about:')) {
    return;
  }

  // Skip pages with no content
  if (!document.body) {
    return;
  }

  try {
    // Use registry to extract page content
    const extracted = await extractCurrentPage();

    // Send extracted content to background for logging
    chrome.runtime.sendMessage({
      type: 'LOG_VISIT',
      data: extracted
    }).catch(error => {
      // Extension might be reloading, ignore
      console.debug('Could not send log visit:', error.message);
    });
  } catch (error) {
    console.error('Error logging page visit:', error);
  }
}

/**
 * Debounced page visit logger
 * Waits for page to settle before logging
 */
function debouncedLogVisit() {
  clearTimeout(logTimer);
  logTimer = setTimeout(logPageVisit, LOG_DEBOUNCE_MS);
}

// ============================================
// Event Listeners
// ============================================

// Log visit when page is fully loaded
if (document.readyState === 'complete') {
  debouncedLogVisit();
} else {
  window.addEventListener('load', debouncedLogVisit);
}

// Log visit when content changes significantly (SPAs)
const observer = new MutationObserver(() => {
  debouncedLogVisit();
});

// Observe only significant changes (not every keystroke)
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: false // Only direct children
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'READ_PAGE') {
    // Allow background to request current page content using registry
    extractCurrentPage().then(extracted => {
      sendResponse({
        success: true,
        data: extracted
      });
    }).catch(error => {
      sendResponse({
        success: false,
        error: error.message
      });
    });
    return true; // Will respond asynchronously
  }
});

// ============================================
// Privacy Guards
// ============================================

// Never read password fields or sensitive inputs
// (extractPageContent only reads visible text, not form values)

// Never log more than 2000 chars per page
// (enforced in extractPageContent)

// Skip sensitive URLs
// (enforced in logPageVisit)
