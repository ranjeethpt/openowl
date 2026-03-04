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

    case 'UPDATE_ENTRY':
      handleUpdateEntry(message.data, sendResponse);
      return true; // Async response

    case 'GET_TODAY_STATS':
      handleGetTodayStats(sendResponse);
      return true; // Async response

    case 'ASK_AI':
      handleAskAI(message.data, sendResponse);
      return true; // Async response

    case 'GET_PATTERNS':
      handleGetPatterns(sendResponse);
      return true; // Async response

    case 'ANALYZE_PATTERNS':
      handleAnalyzePatterns(sendResponse);
      return true; // Async response

    case 'GET_PREFERENCES':
      handleGetPreferences(sendResponse);
      return true; // Async response

    case 'LOG_COPY':
      handleLogCopy(message.data, sendResponse);
      return true; // Async response

    case 'GENERATE_INSIGHT':
      handleGenerateInsight(message.data, sendResponse);
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
    const entries = await storage.getDayLog(date);
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
    // Extract domain from URL
    const url = new URL(data.url);
    const domain = url.hostname;

    // Check if this is a revisit
    const todayEntries = await storage.getDayLog();
    const previousVisit = todayEntries.find(e => e.url === data.url);
    const revisited = !!previousVisit;
    const visitCount = previousVisit ? previousVisit.visitCount + 1 : 1;

    // Save entry
    const entryId = await storage.saveDayLogEntry({
      url: data.url,
      title: data.title,
      domain,
      content: data.content || '',
      extractionType: data.type || data.extractionMethod || 'generic',
      visitedAt: data.visitedAt || Date.now(),
      activeTime: data.activeTime || 0,
      scrollDepth: data.scrollDepth || 0,
      copied: data.copied || [],
      revisited,
      visitCount,
      sessionId: data.sessionId
    });

    sendResponse({ success: true, entryId });
  } catch (error) {
    console.error('Error logging visit:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Update an existing day log entry
 */
async function handleUpdateEntry(data, sendResponse) {
  try {
    await storage.updateEntry(data.id, {
      leftAt: data.leftAt,
      activeTime: data.activeTime,
      scrollDepth: data.scrollDepth,
      copied: data.copied
    });
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error updating entry:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get today's statistics
 */
async function handleGetTodayStats(sendResponse) {
  try {
    const stats = await storage.getTodayStats();
    sendResponse({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting today stats:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Build full context with tabs + history + copied snippets
 * @param {string} question - The question being asked
 * @returns {Promise<Object>} Full context object
 */
async function buildFullContext(question) {
  // Step 1: Live tabs (Feature 2)
  const tabsResult = await new Promise((resolve) => {
    handleGetAllTabs(resolve);
  });
  const allTabs = tabsResult.success ? (tabsResult.tabs || []) : [];

  // Step 2: Today's history (Feature 3)
  const history = await storage.getMeaningfulHistory(20);

  // Step 3: Copied snippets (Feature 3)
  const copies = await storage.getCopiedSnippets();

  // Step 4: Question type detection
  const q = question.toLowerCase();
  let questionType = 'general';
  if (q.match(/standup|yesterday|worked on|what did i/)) {
    questionType = 'standup';
  } else if (q.match(/this page|current|right here|open tab/)) {
    questionType = 'current_page';
  } else if (q.match(/all tabs|everything open|what.*open/)) {
    questionType = 'all_tabs';
  } else if (q.match(/focus|priority|next|should i|what.*work/)) {
    questionType = 'focus';
  } else if (q.match(/today|worked|did i|summary|recap/)) {
    questionType = 'history';
  }

  // Step 5: Select context by type
  let selectedTabs;
  let selectedHistory;

  if (questionType === 'standup') {
    selectedTabs = [];
    selectedHistory = history; // full history
  } else if (questionType === 'current_page') {
    selectedTabs = allTabs.filter(t => t.active).slice(0, 1);
    selectedHistory = [];
  } else if (questionType === 'all_tabs') {
    selectedTabs = allTabs.slice(0, 8);
    selectedHistory = history.slice(0, 5);
  } else if (questionType === 'focus') {
    selectedTabs = allTabs.filter(t => t.active)
      .concat(allTabs.filter(t => !t.active).slice(0, 2));
    selectedHistory = history.slice(0, 10);
  } else if (questionType === 'history') {
    selectedTabs = [];
    selectedHistory = history;
  } else {
    // general
    selectedTabs = allTabs.filter(t => t.active)
      .concat(allTabs.filter(t => !t.active).slice(0, 2));
    selectedHistory = history.slice(0, 5);
  }

  // Step 6: Token budget (4000 tokens = ~16000 chars)
  let totalChars = 0;
  const BUDGET = 16000;

  // Priority: active tab > copies > history > other tabs
  const activeTab = selectedTabs.find(t => t.active);
  if (activeTab) totalChars += (activeTab.content?.length || 0);

  const snippetChars = copies
    .map(c => c.snippet.length)
    .reduce((a, b) => a + b, 0);
  totalChars += snippetChars;

  // Trim if over budget
  const finalHistory = [];
  for (const entry of selectedHistory) {
    const entryChars = (entry.title?.length || 0) + 50;
    if (totalChars + entryChars > BUDGET) break;
    finalHistory.push(entry);
    totalChars += entryChars;
  }

  const finalTabs = [];
  for (const tab of selectedTabs) {
    const tabChars = (tab.content?.length || 0);
    if (totalChars + tabChars > BUDGET) {
      // Include with truncated content
      finalTabs.push({
        ...tab,
        content: tab.content?.slice(0, 300) + '...'
      });
    } else {
      finalTabs.push(tab);
      totalChars += tabChars;
    }
  }

  return {
    tabs: finalTabs,
    history: finalHistory,
    copies: copies.slice(0, 5),
    questionType,
    tabsUsed: finalTabs.length,
    totalTabs: allTabs.length,
    historyEntries: finalHistory.length,
    estimatedTokens: Math.round(totalChars / 4)
  };
}

/**
 * Ask AI a question with smart context building
 */
async function handleAskAI(data, sendResponse) {
  try {
    // Get settings for API key and model
    const settings = await storage.getSettings();
    const provider = data.provider || settings.selectedProvider;
    const apiKey = data.apiKey || settings.apiKeys?.[provider] || '';

    if (!apiKey && provider !== 'ollama') {
      throw new Error('API key not configured. Please set it in Settings.');
    }

    // Build full context if requested
    let context = null;
    if (data.includeContext !== false) {
      context = await buildFullContext(data.prompt);
    }

    // Build system prompt using prompt registry (if not overridden)
    let systemPrompt;

    if (data.systemPrompt) {
      // Custom system prompt provided - use as-is
      systemPrompt = data.systemPrompt;
    } else if (context) {
      // Use 'ask' prompt from registry with full context
      const prompt = getPrompt('ask', {
        tabs: context.tabs,
        tabCount: context.tabsUsed,
        totalTabs: context.totalTabs,
        history: context.history,
        copies: context.copies
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
      model: data.model || settings.selectedModel,
      prompt: data.prompt,
      systemPrompt: systemPrompt,
      ollamaUrl: data.ollamaUrl || settings.ollamaUrl
    });

    sendResponse({
      success: true,
      data: {
        text: response,
        context: context ? {
          tabsUsed: context.tabsUsed,
          totalTabs: context.totalTabs,
          historyEntries: context.historyEntries,
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

/**
 * Get preferences
 */
async function handleGetPreferences(sendResponse) {
  try {
    const preferences = await storage.getPreferences();
    sendResponse({ success: true, data: preferences });
  } catch (error) {
    console.error('Error getting preferences:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Log copy event - update existing entry with copied snippet
 */
async function handleLogCopy(data, sendResponse) {
  try {
    const { url, snippet } = data;
    const entries = await storage.getDayLog();

    // Find most recent entry for this URL
    const entry = entries
      .reverse()
      .find(e => e.url === url);

    if (entry?.id) {
      await storage.updateEntry(entry.id, {
        copied: [...(entry.copied || []), snippet]
      });
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error('Error logging copy:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Generate daily insight from today's activity using LLM
 */
async function handleGenerateInsight(data, sendResponse) {
  try {
    const todayDate = new Date().toISOString().split('T')[0];
    const forceRefresh = data?.forceRefresh || false;

    // Check cache first (12-hour TTL) - skip if forceRefresh
    if (!forceRefresh) {
      const cached = await storage.getCachedInsight(todayDate);
      if (cached && cached.text) {
        console.log('[Insight] Using cached insight from', cached.generatedAt);
        sendResponse({
          success: true,
          data: {
            text: cached.text,
            cached: true,
            generatedAt: cached.generatedAt
          }
        });
        return;
      }
    } else {
      console.log('[Insight] Force refresh requested, bypassing cache');
    }

    // Get today's data
    const dayLog = await storage.getDayLog();
    const stats = await storage.getTodayStats();

    // Get preferences for filtering
    const preferences = await storage.getPreferences();

    // Filter by preferences
    const filterByPrefs = (entries) => {
      if (!preferences?.neverTrack?.length) return entries;
      return entries.filter(e =>
        !preferences.neverTrack.some(d => e.domain?.includes(d))
      );
    };

    const filteredLog = filterByPrefs(dayLog);

    // Don't generate insight if we have no meaningful data
    if (filteredLog.length === 0) {
      sendResponse({
        success: true,
        data: { text: null, reason: 'no_data' }
      });
      return;
    }

    // Build prompt using registry
    const { system, user, maxTokens } = getPrompt('dayInsight', {
      dayLog: filteredLog,
      stats
    });

    // Get settings for LLM
    const settings = await storage.getSettings();

    // Call LLM
    const text = await callLLM({
      provider: settings.selectedProvider,
      apiKey: settings.apiKeys?.[settings.selectedProvider] || '',
      model: settings.selectedModel,
      prompt: user || 'Analyze my day',
      systemPrompt: system,
      ollamaUrl: settings.ollamaUrl
    });

    // Cache the result (12-hour TTL)
    await storage.cacheInsight(todayDate, text);

    sendResponse({
      success: true,
      data: {
        text,
        cached: false,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error generating insight:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Analyze patterns from last 7 days of logs
 */
async function handleAnalyzePatterns(sendResponse) {
  try {
    // Get last 7 days of logs
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const startDateStr = startDate.toISOString().split('T')[0];

    const entries = await storage.getLogRange(startDateStr, endDate);

    if (entries.length === 0) {
      sendResponse({
        success: true,
        data: {
          morningRoutine: [],
          peakHours: [],
          topSites: [],
          workClusters: [],
          avgTabsOpen: 0,
          avgSessionLength: 0
        }
      });
      return;
    }

    // Analyze patterns
    const patterns = analyzePatterns(entries);

    // Save patterns to storage
    await storage.savePatterns(patterns);

    sendResponse({ success: true, data: patterns });
  } catch (error) {
    console.error('Error analyzing patterns:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Analyze patterns from day log entries
 * @param {Array} entries - Day log entries from last 7 days
 * @returns {Object} Analyzed patterns
 */
function analyzePatterns(entries) {
  // Morning routine (sites visited 6am-10am)
  const morningEntries = entries.filter(e => {
    const hour = new Date(e.visitedAt).getHours();
    return hour >= 6 && hour < 10;
  });

  const morningDomains = {};
  morningEntries.forEach(e => {
    if (e.domain) {
      morningDomains[e.domain] = (morningDomains[e.domain] || 0) + 1;
    }
  });

  const morningRoutine = Object.entries(morningDomains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }));

  // Peak hours (most active hours)
  const hourCounts = {};
  entries.forEach(e => {
    const hour = new Date(e.visitedAt).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + (e.activeTime || 0);
  });

  const peakHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, time]) => ({
      hour: parseInt(hour),
      totalActiveTime: time
    }));

  // Top sites (by active time)
  const siteTimes = {};
  entries.forEach(e => {
    if (e.domain) {
      siteTimes[e.domain] = (siteTimes[e.domain] || 0) + (e.activeTime || 0);
    }
  });

  const topSites = Object.entries(siteTimes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, time]) => ({ domain, totalActiveTime: time }));

  // Work clusters (sites visited together in same session)
  const sessionClusters = {};
  entries.forEach(e => {
    if (!e.sessionId || !e.domain) return;

    if (!sessionClusters[e.sessionId]) {
      sessionClusters[e.sessionId] = new Set();
    }
    sessionClusters[e.sessionId].add(e.domain);
  });

  // Find common clusters
  const clusterPatterns = {};
  Object.values(sessionClusters).forEach(domains => {
    if (domains.size < 2) return;

    const sortedDomains = Array.from(domains).sort();
    const clusterKey = sortedDomains.slice(0, 3).join('+');

    clusterPatterns[clusterKey] = (clusterPatterns[clusterKey] || 0) + 1;
  });

  const workClusters = Object.entries(clusterPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cluster, count]) => ({
      domains: cluster.split('+'),
      count
    }));

  // Average tabs open per session
  const sessionsWithMultipleTabs = Object.values(sessionClusters).filter(
    domains => domains.size > 1
  );
  const avgTabsOpen = sessionsWithMultipleTabs.length > 0
    ? Math.round(
        sessionsWithMultipleTabs.reduce((sum, domains) => sum + domains.size, 0) /
        sessionsWithMultipleTabs.length
      )
    : 0;

  // Average session length (time between first and last entry in session)
  const sessionLengths = [];
  Object.keys(sessionClusters).forEach(sessionId => {
    const sessionEntries = entries.filter(e => e.sessionId === sessionId);
    if (sessionEntries.length < 2) return;

    const times = sessionEntries.map(e => e.visitedAt).sort();
    const length = times[times.length - 1] - times[0];
    sessionLengths.push(length);
  });

  const avgSessionLength = sessionLengths.length > 0
    ? Math.round(
        sessionLengths.reduce((sum, len) => sum + len, 0) / sessionLengths.length
      )
    : 0;

  return {
    morningRoutine,
    peakHours,
    topSites,
    workClusters,
    avgTabsOpen,
    avgSessionLength
  };
}

// ============================================
// Chrome History Import
// ============================================

/**
 * Import Chrome browsing history from last N days
 * Filters using preferences (Never Track list)
 * @param {number} daysBack - Number of days to import (default 30)
 * @returns {Promise<Object>} { imported, skipped } counts
 */
async function importChromeHistory(daysBack = 30) {
  const prefs = await storage.getPreferences();
  const startTime = Date.now() - (daysBack * 24 * 60 * 60 * 1000);

  // Get history items
  const items = await chrome.history.search({
    text: '',
    startTime,
    maxResults: 10000
  });

  console.log(`[History Import] Found ${items.length} total history items`);

  // Filter using preferences
  const filtered = items.filter(item => {
    try {
      const domain = new URL(item.url).hostname;

      // Skip non-http
      if (!item.url.startsWith('http')) return false;

      // Skip never-track domains
      if (prefs.neverTrack.some(d => domain.includes(d))) {
        return false;
      }

      // Skip if visited only once
      // (reduces noise from random one-off visits)
      return (item.visitCount || 0) >= 2;
    } catch {
      return false; // skip malformed URLs
    }
  });

  console.log(`[History Import] Filtered to ${filtered.length} items`);

  // Convert to day log entries
  const todayDate = new Date().toISOString().split('T')[0];
  const entries = filtered.map(item => {
    const url = new URL(item.url);
    return {
      url: item.url,
      title: item.title || url.hostname,
      domain: url.hostname,
      content: '',
      extractionType: 'history_import',
      date: todayDate, // Use today's date so it shows in Today tab
      originalDate: new Date(item.lastVisitTime).toISOString().split('T')[0], // Keep original for timeline
      visitedAt: item.lastVisitTime,
      leftAt: null,
      activeTime: 0,
      totalTime: 0,
      scrollDepth: 0,
      copied: [],
      revisited: false,
      visitCount: item.visitCount || 1,
      sessionId: 'history'
    };
  });

  // Import in batch
  return storage.importHistoryEntries(entries);
}

// ============================================
// Extension Lifecycle Events
// ============================================

// Initialize extension on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('OpenOwl installed/updated:', details.reason);

  // Initialize IndexedDB on install so it shows up in DevTools
  try {
    await storage.getDayLog(); // This will create the database
    console.log('IndexedDB initialized');
  } catch (error) {
    console.error('Error initializing IndexedDB:', error);
  }

  // Auto-import Chrome history on first install
  if (details.reason === 'install') {
    console.log('[OpenOwl] First install detected - importing history...');
    try {
      // Import up to 30 days of history
      const result = await importChromeHistory(30);
      console.log(`[OpenOwl] History import finished. Result: ${result.imported} imported, ${result.skipped} skipped.`);
      
      await chrome.storage.local.set({
        historyImported: true,
        historyImport: {
          lastImported: new Date().toISOString(),
          entriesImported: result.imported,
          daysImported: 30,
          shown: false  // banner not shown yet
        }
      });
    } catch (err) {
      console.error('[OpenOwl] History import failed:', err);
      // Fail silently - not critical, but log it
    }
  }

  // Set up periodic cleanup alarm
  chrome.alarms.create('cleanOldLogs', { periodInMinutes: 1440 }); // 24 hours
});

// ============================================
// Tab Change Listeners
// ============================================

/**
 * Notify sidebar when tabs change (debounced)
 */
let notifyTimeout = null;
function notifyTabsChanged() {
  if (notifyTimeout) clearTimeout(notifyTimeout);

  notifyTimeout = setTimeout(() => {
    // Send message to sidebar (it will ignore if not listening)
    chrome.runtime.sendMessage({ type: 'TABS_CHANGED' }).catch(() => {
      // Sidebar might not be open, ignore error
    });
    notifyTimeout = null;
  }, 500); // Debounce for 500ms
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
  if (changeInfo.status === 'complete' || changeInfo.url || changeInfo.title) {
    notifyTabsChanged();
  }
});

// Notify when active tab changes
chrome.tabs.onActivated.addListener(() => {
  notifyTabsChanged();
});

// ============================================
// Periodic Cleanup
// ============================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanOldLogs') {
    try {
      await storage.cleanupOldEntries(30);
      console.log('Old logs cleaned successfully');
    } catch (error) {
      console.error('Error cleaning old logs:', error);
    }
  }
});
