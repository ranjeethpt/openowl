/**
 * Content script for OpenOwl
 * Runs on all pages to track visits and extract content using the registry system
 */

import { extractCurrentPage } from './extractors/registry.js';
import { DEFAULT_PREFERENCES } from '../constants.js';

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
let forceLog = false;
let minActiveTimeMs = DEFAULT_PREFERENCES.minActiveTimeMs; // Default, will be updated from prefs

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

      // If we haven't logged this visit yet and reached threshold, trigger it
      if (!currentEntryId && activeTime >= minActiveTimeMs) {
        debouncedLogVisit();
      }
    }
  }, 1000);
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
    // Get preferences to check filters
    const prefsResponse = await chrome.runtime.sendMessage({ type: 'GET_PREFERENCES' });
    if (!prefsResponse || !prefsResponse.success) {
      console.debug('Could not get preferences, skipping filters');
      // Continue without filters if preferences unavailable
    } else {
      const prefs = prefsResponse.data;
      const hostname = window.location.hostname;

      // Update min active time from preferences
      if (prefs.minActiveTimeMs !== undefined) {
        minActiveTimeMs = prefs.minActiveTimeMs;
      }

      // Check Never Track list
      if (prefs.neverTrack.some(d => hostname.includes(d))) {
        console.log('[DayLog] Domain in never track list, skipping:', hostname);
        return;
      }

      // Check work hours
      if (prefs.workHours.enabled) {
        const hour = new Date().getHours();
        const [startH] = prefs.workHours.start.split(':').map(Number);
        const [endH] = prefs.workHours.end.split(':').map(Number);
        if (hour < startH || hour >= endH) {
          console.log('[DayLog] Outside work hours, skipping:', hour);
          return;
        }
      }

      // Log only if active time > threshold (unless forced by copy)
      if (activeTime < minActiveTimeMs && !forceLog) {
        console.log(`[DayLog] < ${minActiveTimeMs / 1000}s active time, skipping:`, hostname);
        return;
      }
    }

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
document.addEventListener('copy', async () => {
  try {
    const text = window.getSelection()?.toString()?.trim();
    if (!text || text.length < 20) return;

    // Don't copy password fields
    const active = document.activeElement;
    if (active?.type === 'password') return;

    // Set flag to force log even if under 10s threshold
    forceLog = true;

    // Store locally for current page
    copiedTexts.push({
      text: text.substring(0, 200), // Limit to 200 chars
      timestamp: Date.now()
    });

    // Keep only last 5 copies
    if (copiedTexts.length > 5) {
      copiedTexts.shift();
    }

    // Trigger immediate log visit
    debouncedLogVisit();

    // Send to background to update existing entry
    chrome.runtime.sendMessage({
      type: 'LOG_COPY',
      data: {
        url: location.href,
        snippet: text.slice(0, 150)
      }
    }).catch(() => {
      // Extension might be reloading, ignore
    });
  } catch (error) {
    // Ignore errors
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
    forceLog = false;
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
