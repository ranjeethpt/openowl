/**
 * Content script for OpenOwl
 * Runs on all pages to track visits and extract content using the registry system
 */

import { extractCurrentPage } from './extractors/registry.js';

console.log('OpenOwl content script loaded');

// ============================================
// State Management
// ============================================

// Debounce timer for page logging
let logTimer = null;
const LOG_DEBOUNCE_MS = 500;

// Active time tracking
let pageStartTime = Date.now();
let activeTime = 0;
let isPageVisible = !document.hidden;
let activeTimeInterval = null;
let currentEntryId = null;
let lastUrl = window.location.href;
let maxScrollDepth = 0;
let copiedTexts = [];

// Generate session ID (persists for browser session)
const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);

/**
 * Track active time when page is visible
 */
function startActiveTimeTracking() {
  if (activeTimeInterval) return;

  activeTimeInterval = setInterval(() => {
    if (isPageVisible) {
      activeTime += 1000; // Add 1 second
    }
  }, 1000);
}

/**
 * Stop active time tracking
 */
function stopActiveTimeTracking() {
  if (activeTimeInterval) {
    clearInterval(activeTimeInterval);
    activeTimeInterval = null;
  }
}

/**
 * Track scroll depth
 */
function updateScrollDepth() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
  const depth = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;

  if (depth > maxScrollDepth) {
    maxScrollDepth = depth;
  }
}

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
    const response = await chrome.runtime.sendMessage({
      type: 'LOG_VISIT',
      data: {
        ...extracted,
        visitedAt: pageStartTime,
        activeTime,
        scrollDepth: maxScrollDepth,
        copied: copiedTexts,
        sessionId
      }
    });

    // Store entry ID for future updates
    if (response && response.entryId) {
      currentEntryId = response.entryId;
    }
  } catch (error) {
    // Extension might be reloading, ignore
    console.debug('Could not send log visit:', error.message);
  }
}

/**
 * Update current entry when leaving page
 */
async function updateCurrentEntry() {
  if (!currentEntryId) return;

  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_ENTRY',
      data: {
        id: currentEntryId,
        leftAt: Date.now(),
        activeTime,
        scrollDepth: maxScrollDepth,
        copied: copiedTexts
      }
    });
  } catch (error) {
    console.debug('Could not update entry:', error.message);
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

// Start active time tracking
startActiveTimeTracking();

// Log visit when page is fully loaded
if (document.readyState === 'complete') {
  debouncedLogVisit();
} else {
  window.addEventListener('load', debouncedLogVisit);
}

// Track visibility changes (tab switching, minimize)
document.addEventListener('visibilitychange', () => {
  isPageVisible = !document.hidden;

  if (document.hidden) {
    // Update entry when tab becomes hidden
    updateCurrentEntry();
  }
});

// Track scroll depth
window.addEventListener('scroll', () => {
  updateScrollDepth();
}, { passive: true });

// Track copy events
document.addEventListener('copy', (e) => {
  const selection = window.getSelection().toString().trim();
  if (selection && selection.length > 10 && selection.length < 500) {
    copiedTexts.push({
      text: selection.substring(0, 200), // Limit to 200 chars
      timestamp: Date.now()
    });

    // Keep only last 5 copies
    if (copiedTexts.length > 5) {
      copiedTexts.shift();
    }
  }
});

// Update entry before leaving page
window.addEventListener('beforeunload', () => {
  updateCurrentEntry();
});

// SPA navigation detection (pushState/replaceState)
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(this, args);
  handleUrlChange();
};

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  handleUrlChange();
};

window.addEventListener('popstate', handleUrlChange);

function handleUrlChange() {
  const newUrl = window.location.href;
  if (newUrl !== lastUrl) {
    console.log('[DayLog] SPA navigation detected:', newUrl);

    // Update old entry
    updateCurrentEntry();

    // Reset state for new page
    pageStartTime = Date.now();
    activeTime = 0;
    maxScrollDepth = 0;
    copiedTexts = [];
    currentEntryId = null;
    lastUrl = newUrl;

    // Log new visit
    debouncedLogVisit();
  }
}

// Log visit when content changes significantly (SPAs fallback)
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
