/**
 * Background service worker for OpenOwl
 * Handles all message passing and LLM calls
 */

import { callLLM } from '../llm/index.js';
import * as storage from '../storage/index.js';
import { getPrompt } from '../prompts/registry.js';

// ============================================
// Service Worker Lifecycle
// ============================================

console.log('OpenOwl background service worker loaded');

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// ============================================
// Message Handlers
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  // Handle different message types
  switch (message.type) {
    case 'GET_SETTINGS':
      handleGetSettings(sendResponse);
      return true; // Async response

    case 'SAVE_SETTINGS':
      handleSaveSettings(message.data, sendResponse);
      return true; // Async response

    case 'GET_ALL_TABS':
      handleGetAllTabs(sendResponse);
      return true; // Async response

    case 'GET_DAY_LOG':
      handleGetDayLog(message.date, sendResponse);
      return true; // Async response

    case 'GET_YESTERDAY_LOG':
      handleGetYesterdayLog(sendResponse);
      return true; // Async response

    case 'LOG_VISIT':
      handleLogVisit(message.data, sendResponse);
      return true; // Async response

    case 'ASK_AI':
      handleAskAI(message.data, sendResponse);
      return true; // Async response

    case 'GET_PATTERNS':
      handleGetPatterns(sendResponse);
      return true; // Async response

    default:
      console.warn('Unknown message type:', message.type);
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// ============================================
// Handler Functions
// ============================================

/**
 * Get settings from storage
 */
async function handleGetSettings(sendResponse) {
  try {
    const settings = await storage.getSettings();
    sendResponse({ success: true, data: settings });
  } catch (error) {
    console.error('Error getting settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Save settings to storage
 */
async function handleSaveSettings(data, sendResponse) {
  try {
    await storage.saveSettings(data);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get all open tabs content using READ_PAGE message
 */
async function handleGetAllTabs(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({});
    const tabsData = [];
    let skippedCount = 0;

    // Get active tab ID
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTabId = activeTabs[0]?.id;

    for (const tab of tabs) {
      // Skip chrome:// extension URLs, and new tab pages
      if (tab.url?.startsWith('chrome://') ||
          tab.url?.startsWith('chrome-extension://') ||
          tab.url?.startsWith('about:') ||
          tab.url === 'chrome://newtab/') {
        skippedCount++;
        continue;
      }

      try {
        // Send READ_PAGE message to content script with 2 second timeout
        const response = await Promise.race([
          chrome.tabs.sendMessage(tab.id, { type: 'READ_PAGE' }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 2000)
          )
        ]);

        if (response.success) {
          tabsData.push({
            ...response.data,
            active: tab.id === activeTabId
          });
        } else {
          // Content script returned error
          tabsData.push({
            url: tab.url,
            title: tab.title,
            content: '(unavailable)',
            type: 'error',
            extractionMethod: 'fallback',
            active: tab.id === activeTabId
          });
        }
      } catch (error) {
        // Tab doesn't have content script or timed out
        console.warn(`Could not read tab ${tab.id}:`, error.message);
        tabsData.push({
          url: tab.url,
          title: tab.title,
          content: '(unavailable)',
          type: 'error',
          extractionMethod: 'fallback',
          active: tab.id === activeTabId
        });
      }
    }

    sendResponse({
      success: true,
      tabs: tabsData,
      totalTabs: tabs.length,
      readableTabs: tabsData.length,
      skippedTabs: skippedCount
    });
  } catch (error) {
    console.error('Error getting tabs:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get day log for a specific date
 */
async function handleGetDayLog(date, sendResponse) {
  try {
    const entries = date ? await storage.getDayLog(date) : await storage.getTodayLog();
    sendResponse({ success: true, data: entries });
  } catch (error) {
    console.error('Error getting day log:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get yesterday's log
 */
async function handleGetYesterdayLog(sendResponse) {
  try {
    const entries = await storage.getYesterdayLog();
    sendResponse({ success: true, data: entries });
  } catch (error) {
    console.error('Error getting yesterday log:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Log a visit to IndexedDB
 */
async function handleLogVisit(data, sendResponse) {
  try {
    await storage.logVisit({
      url: data.url,
      title: data.title,
      content: data.content,
      timestamp: Date.now()
    });
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error logging visit:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Build smart context for AI question
 * Detects question type and selects/compresses relevant tabs
 * @param {string} question - User's question
 * @param {Array} tabs - All available tabs
 * @returns {Object} Context with selected tabs and metadata
 */
function buildContextForQuestion(question, tabs) {
  const lowerQuestion = question.toLowerCase();

  // Step 1: Detect question type
  let questionType = 'general';
  if (lowerQuestion.match(/\b(this|current|here|this page)\b/)) {
    questionType = 'current_page';
  } else if (lowerQuestion.match(/\b(all|everything|tabs|open|all tabs)\b/)) {
    questionType = 'all_tabs';
  } else if (lowerQuestion.match(/\b(standup|yesterday|worked on|today|daily)\b/)) {
    questionType = 'standup';
  }

  // Step 2: Select tabs by type
  let selectedTabs;
  const TOKEN_BUDGET = 4000;

  switch (questionType) {
    case 'current_page':
      // Active tab only
      selectedTabs = tabs.filter(t => t.active).slice(0, 1);
      break;

    case 'standup':
      // No tabs needed for standup (uses day log instead)
      selectedTabs = [];
      break;

    case 'all_tabs':
      // All tabs, max 8
      selectedTabs = tabs.slice(0, 8);
      break;

    case 'general':
    default:
      // Active tab + 2 most recent = max 3
      const activeTab = tabs.find(t => t.active);
      const otherTabs = tabs.filter(t => !t.active).slice(0, 2);
      selectedTabs = activeTab ? [activeTab, ...otherTabs] : otherTabs;
      break;
  }

  // Step 3: Compress content
  selectedTabs = selectedTabs.map(tab => {
    if (tab.extractionMethod === 'generic' && tab.content.length > 500) {
      // Compress generic extractions to 500 chars
      return {
        ...tab,
        content: tab.content.substring(0, 500) + '...',
        compressed: true
      };
    }
    return { ...tab, compressed: false };
  });

  // Step 4: Apply token budget
  let estimatedTokens = 0;
  const finalTabs = [];

  for (const tab of selectedTabs) {
    const tabTokens = Math.ceil(tab.content.length / 4);
    if (estimatedTokens + tabTokens > TOKEN_BUDGET) {
      break;
    }
    finalTabs.push(tab);
    estimatedTokens += tabTokens;
  }

  // Step 5: Return context
  return {
    tabs: finalTabs,
    tabCount: finalTabs.length,
    totalTabCount: tabs.length,
    questionType,
    estimatedTokens
  };
}

/**
 * Ask AI a question with smart context building
 */
async function handleAskAI(data, sendResponse) {
  try {
    // Get settings for API key and model
    const settings = await storage.getSettings();
    const provider = settings.selectedProvider;
    const apiKey = settings.apiKeys?.[provider] || '';

    if (!apiKey && provider !== 'ollama') {
      throw new Error('API key not configured. Please set it in Settings.');
    }

    // Get all tabs if context is requested
    let context = null;
    if (data.includeContext !== false) {
      // Get all tabs
      const tabsResponse = await new Promise((resolve) => {
        handleGetAllTabs(resolve);
      });

      if (tabsResponse.success) {
        // Build smart context
        context = buildContextForQuestion(data.prompt, tabsResponse.tabs);
      }
    }

    // Build system prompt using prompt registry (if not overridden)
    let systemPrompt;

    if (data.systemPrompt) {
      // Custom system prompt provided - use as-is
      systemPrompt = data.systemPrompt;
    } else if (context) {
      // Use 'ask' prompt from registry with tab context
      const prompt = getPrompt('ask', {
        tabs: context.tabs,
        tabCount: context.tabCount,
        totalTabs: context.totalTabCount
      });
      systemPrompt = prompt.system;
    } else {
      // No context - use simple fallback
      systemPrompt = 'You are OpenOwl, an AI assistant for developers.';
    }

    // Call LLM
    const response = await callLLM({
      provider: provider,
      apiKey: apiKey,
      model: settings.selectedModel,
      prompt: data.prompt,
      systemPrompt: systemPrompt,
      ollamaUrl: settings.ollamaUrl
    });

    sendResponse({
      success: true,
      data: {
        text: response,
        context: context ? {
          tabsUsed: context.tabCount,
          totalTabs: context.totalTabCount,
          questionType: context.questionType,
          estimatedTokens: context.estimatedTokens
        } : null
      }
    });
  } catch (error) {
    console.error('Error asking AI:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get learned patterns
 */
async function handleGetPatterns(sendResponse) {
  try {
    const patterns = await storage.getPatterns();
    sendResponse({ success: true, data: patterns });
  } catch (error) {
    console.error('Error getting patterns:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ============================================
// Extension Lifecycle Events
// ============================================

// Initialize extension on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('OpenOwl installed/updated:', details.reason);

  // Set up periodic cleanup alarm
  chrome.alarms.create('cleanOldLogs', { periodInMinutes: 1440 }); // 24 hours
});

// ============================================
// Tab Change Listeners
// ============================================

/**
 * Notify sidebar when tabs change
 */
function notifyTabsChanged() {
  // Send message to sidebar (it will ignore if not listening)
  chrome.runtime.sendMessage({ type: 'TABS_CHANGED' }).catch(() => {
    // Sidebar might not be open, ignore error
  });
}

// Notify when tabs are created
chrome.tabs.onCreated.addListener(() => {
  notifyTabsChanged();
});

// Notify when tabs are removed
chrome.tabs.onRemoved.addListener(() => {
  notifyTabsChanged();
});

// Notify when tabs are updated (URL changes, etc)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Only notify on significant changes (URL or title changes)
  if (changeInfo.url || changeInfo.title) {
    notifyTabsChanged();
  }
});

// ============================================
// Periodic Cleanup
// ============================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanOldLogs') {
    try {
      await storage.cleanOldLogs(30);
      console.log('Old logs cleaned successfully');
    } catch (error) {
      console.error('Error cleaning old logs:', error);
    }
  }
});
