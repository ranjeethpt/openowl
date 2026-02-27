/**
 * Content script for OpenOwl
 * Runs on all pages to track visits and extract content
 */

console.log('OpenOwl content script loaded');

// Debounce timer for page logging
let logTimer = null;
const LOG_DEBOUNCE_MS = 500;

/**
 * Extract main content from the page
 * Strips HTML, nav, footer, etc. and limits to 2000 chars
 */
function extractPageContent() {
  try {
    // Clone body to avoid modifying actual DOM
    const bodyClone = document.body.cloneNode(true);

    // Remove unwanted elements
    const unwanted = bodyClone.querySelectorAll(
      'script, style, nav, footer, header, iframe, noscript, svg'
    );
    unwanted.forEach(el => el.remove());

    // Get text content
    let text = bodyClone.innerText || bodyClone.textContent || '';

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Limit to 2000 characters
    return text.substring(0, 2000);
  } catch (error) {
    console.error('Error extracting page content:', error);
    return '';
  }
}

/**
 * Log current page visit to background
 */
function logPageVisit() {
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
    const pageData = {
      url: window.location.href,
      title: document.title || 'Untitled',
      content: extractPageContent()
    };

    // Send to background for logging
    chrome.runtime.sendMessage({
      type: 'LOG_VISIT',
      data: pageData
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

// Listen for messages from background (if needed for future features)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'READ_PAGE') {
    // Allow background to request current page content
    sendResponse({
      success: true,
      data: {
        url: window.location.href,
        title: document.title,
        content: extractPageContent()
      }
    });
    return true;
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
