/**
 * Background service worker for OpenOwl
 * Handles all message passing and LLM calls
 */

import { callLLM } from '../llm/index.js';
import * as storage from '../storage/index.js';

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
 * Get all open tabs content
 */
async function handleGetAllTabs(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({});
    const tabsData = [];

    for (const tab of tabs) {
      // Skip chrome:// and extension URLs
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        continue;
      }

      try {
        // Try to read page content
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageContent
        });

        tabsData.push({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          content: result?.result || ''
        });
      } catch (error) {
        // Some tabs block scripts - skip them gracefully
        console.warn(`Could not read tab ${tab.id}:`, error.message);
        tabsData.push({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          content: '[Content unavailable]'
        });
      }
    }

    sendResponse({ success: true, data: tabsData });
  } catch (error) {
    console.error('Error getting tabs:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Function to extract page content (injected into tabs)
 */
function extractPageContent() {
  // Remove script, style, nav, footer, header elements
  const contentElements = document.body.cloneNode(true);
  const unwanted = contentElements.querySelectorAll('script, style, nav, footer, header, iframe');
  unwanted.forEach(el => el.remove());

  // Get text content
  let text = contentElements.innerText || contentElements.textContent || '';

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Limit to 2000 characters
  return text.substring(0, 2000);
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
 * Ask AI a question
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

    // Call LLM
    const response = await callLLM({
      provider: provider,
      apiKey: apiKey,
      model: settings.selectedModel,
      prompt: data.prompt,
      systemPrompt: data.systemPrompt || 'You are a helpful assistant.',
      ollamaUrl: settings.ollamaUrl
    });

    sendResponse({ success: true, data: { text: response } });
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
