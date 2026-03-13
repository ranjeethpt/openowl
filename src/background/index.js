/**
 * Background service worker for OpenOwl
 * Handles all message passing and LLM calls
 */

import { callLLM, fetchModels } from '../llm/index.js';
import * as storage from '../storage/index.js';
import { getPrompt } from '../prompts/registry.js';
import { detectTemplate } from '../utils/intentDetector.js';
import { MODEL_CONTEXT_LIMITS, TAB_FETCH_TIMEOUT } from '../constants.js';

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

    case 'GET_RECENT_DAY_WITH_ACTIVITY':
      handleGetRecentDayWithActivity(sendResponse);
      return true; // Async response

    case 'GET_LIVE_ENTRIES_COUNT':
      handleGetLiveEntriesCount(sendResponse);
      return true; // Async response

    case 'GET_HISTORY_IMPORT_COUNT':
      handleGetHistoryImportCount(sendResponse);
      return true; // Async response

    case 'GET_HISTORY_FOR_DISPLAY':
      handleGetHistoryForDisplay(message.data, sendResponse);
      return true; // Async response

    case 'GET_WORK_HISTORY':
      handleGetWorkHistory(message.data, sendResponse);
      return true; // Async response

    case 'GET_TABS':
      handleGetTabs(sendResponse);
      return true; // Async response

    case 'GET_LAST_ACTIVITY_DATE':
      handleGetLastActivityDate(sendResponse);
      return true; // Async response

    case 'GET_LIVE_ENTRIES_TODAY_COUNT':
      handleGetLiveEntriesTodayCount(sendResponse);
      return true; // Async response

    case 'GET_LAST_ACTIVITY_LOG':
      handleGetLastActivityLog(sendResponse);
      return true; // Async response

    case 'TEST_OLLAMA_CONNECTION':
      handleTestOllamaConnection(sendResponse);
      return true; // Async response

    case 'FETCH_MODELS':
      handleFetchModels(message.data, sendResponse);
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

    // Calculate dynamic timeout based on number of tabs
    const timeout = Math.min(
      TAB_FETCH_TIMEOUT.base + (tabs.length * TAB_FETCH_TIMEOUT.perTab),
      TAB_FETCH_TIMEOUT.max
    );
    console.log(`[Tabs] Using ${timeout}ms timeout for ${tabs.length} tabs`);

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
        // Send READ_PAGE message to content script with dynamic timeout
        const response = await Promise.race([
          chrome.tabs.sendMessage(tab.id, { type: 'READ_PAGE' }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
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
 * Get token budget for current model
 * @param {string} modelName - Model identifier
 * @returns {number} Token budget for context
 */
function getModelTokenBudget(modelName) {
  // For Ollama, use the conservative default
  if (!modelName || modelName === 'ollama') {
    return MODEL_CONTEXT_LIMITS.ollama;
  }

  // Check if we have a specific limit for this model
  const limit = MODEL_CONTEXT_LIMITS[modelName];
  if (limit) {
    console.log(`[Context] Using ${limit.toLocaleString()} token budget for ${modelName}`);
    return limit;
  }

  // Use default for unknown models
  console.log(`[Context] Unknown model ${modelName}, using default ${MODEL_CONTEXT_LIMITS.default.toLocaleString()} token budget`);
  return MODEL_CONTEXT_LIMITS.default;
}

/**
 * Build full context with tabs + history + copied snippets
 * @param {string} question - The question being asked
 * @param {string} modelName - Model being used (for token budget)
 * @returns {Promise<Object>} Full context object
 */
async function buildFullContext(question, modelName = null) {
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

  // Step 6: Dynamic token budget based on model
  const tokenBudget = getModelTokenBudget(modelName);
  const charBudget = tokenBudget * 4; // ~4 chars per token
  let totalChars = 0;

  // Priority: active tab > copies > history > other tabs
  const activeTab = selectedTabs.find(t => t.active);
  if (activeTab) totalChars += (activeTab.content?.length || 0);

  const snippetChars = copies
    .map(c => c.text?.length || 0)
    .reduce((a, b) => a + b, 0);
  totalChars += snippetChars;

  // Trim if over budget
  const finalHistory = [];
  for (const entry of selectedHistory) {
    const entryChars = (entry.title?.length || 0) + 50;
    if (totalChars + entryChars > charBudget) break;
    finalHistory.push(entry);
    totalChars += entryChars;
  }

  const finalTabs = [];
  for (const tab of selectedTabs) {
    const tabChars = (tab.content?.length || 0);
    if (totalChars + tabChars > charBudget) {
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

  console.log(`[Context] Built context: ${totalChars.toLocaleString()} chars (~${Math.round(totalChars / 4).toLocaleString()} tokens) of ${tokenBudget.toLocaleString()} budget`);

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
    const { question, messages = [] } = data;

    console.log('[ASK_AI] Received:', { question, messagesCount: messages.length });
    console.log('[ASK_AI] Messages:', JSON.stringify(messages, null, 2));

    // Get settings for API key and model
    const settings = await storage.getSettings();

    // Step 1: Check for template match
    const detected = await detectTemplate(question);

    if (detected) {
      const { key, template } = detected;
      console.log(`[ASK_AI] Template detected: ${key}`);

      // Gather exactly what this template needs
      const templateData = await template.gather(question);

      // Check if custom template returned isEmpty
      if (template.isCustom && templateData.isEmpty) {
        console.log(`[ASK_AI] Custom template returned isEmpty: ${templateData.emptyReason}`);
        sendResponse({
          success: true,
          data: {
            text: templateData.emptyMessage,
            templateUsed: key,
            context: { isEmpty: true }
          }
        });
        return;
      }

      // For custom templates, pass the full template config via promptConfig
      const promptContext = template.isCustom
        ? { ...templateData, config: template.promptConfig }
        : templateData;

      // Purpose-built prompt from registry
      const builtPrompt = getPrompt(template.prompt, promptContext);
      const { system, user, maxTokens } = builtPrompt;

      // Use the user message from prompt, or fall back to the question
      const currentPrompt = user || question;

      // Call LLM with full conversation history
      const result = await callLLM({
        provider: settings.selectedProvider,
        apiKey: settings.apiKeys?.[settings.selectedProvider] || '',
        model: settings.selectedModel,
        prompt: currentPrompt,
        systemPrompt: system,
        messages, // ← multi-turn history
        maxTokens,
        ollamaUrl: settings.ollamaUrl
      });

      // Extract text and usage (handle both streaming string and non-streaming object)
      const text = typeof result === 'string' ? result : result.text;
      const usage = typeof result === 'object' ? result.usage : null;

      // Use actual tokens if available, otherwise estimate
      const tokensUsed = usage?.total_tokens || templateData.estimatedTokens ||
                        (system?.length ? Math.round(system.length / 4) : 0);

      console.log(`[ASK_AI] Template ${key} - Tokens:`, usage || 'estimated');

      sendResponse({
        success: true,
        data: {
          text,
          templateUsed: key,
          context: {
            tokensUsed,
            usage: usage || { estimated: true }
          }
        }
      });
      return;
    }

    // No template match → general full context
    console.log('[ASK_AI] No template match, using full context');
    const context = await buildFullContext(question, settings.selectedModel);
    const builtPrompt = getPrompt('ask', {
      tabs: context.tabs,
      tabCount: context.tabsUsed,
      totalTabs: context.totalTabs,
      history: context.history,
      copies: context.copies
    });

    const result = await callLLM({
      provider: settings.selectedProvider,
      apiKey: settings.apiKeys?.[settings.selectedProvider] || '',
      model: settings.selectedModel,
      prompt: question,
      systemPrompt: builtPrompt.system,
      messages, // ← multi-turn history
      maxTokens: builtPrompt.maxTokens || 2000,
      ollamaUrl: settings.ollamaUrl
    });

    // Extract text and usage
    const text = typeof result === 'string' ? result : result.text;
    const usage = typeof result === 'object' ? result.usage : null;
    const tokensUsed = usage?.total_tokens || context.estimatedTokens;

    console.log('[ASK_AI] General context - Tokens:', usage || 'estimated');

    sendResponse({
      success: true,
      data: {
        text,
        context: {
          tokensUsed,
          usage: usage || { estimated: true }
        }
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
      const copiedSnippet = {
        text: snippet,
        timestamp: Date.now()
      };

      await storage.updateEntry(entry.id, {
        copied: [...(entry.copied || []), copiedSnippet]
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
    const result = await callLLM({
      provider: settings.selectedProvider,
      apiKey: settings.apiKeys?.[settings.selectedProvider] || '',
      model: settings.selectedModel,
      prompt: user || 'Analyze my day',
      systemPrompt: system,
      ollamaUrl: settings.ollamaUrl
    });

    // Extract text and usage
    const text = typeof result === 'string' ? result : result.text;
    const usage = typeof result === 'object' ? result.usage : null;

    console.log('[Insight] Generated insight - Tokens:', usage || 'estimated');

    // Cache the result (12-hour TTL)
    await storage.cacheInsight(todayDate, text);

    sendResponse({
      success: true,
      data: {
        text,
        cached: false,
        generatedAt: new Date().toISOString(),
        usage: usage || { estimated: true }
      }
    });
  } catch (error) {
    console.error('Error generating insight:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get most recent day with activity (excluding today)
 */
async function handleGetRecentDayWithActivity(sendResponse) {
  try {
    const entries = await storage.getLastActivityLog();
    const date = entries.length > 0 ? entries[0].date : null;

    sendResponse({
      success: true,
      data: {
        entries,
        date
      }
    });
  } catch (error) {
    console.error('Error getting recent day with activity:', error);
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

    console.log(`[Patterns] Analyzing ${entries.length} entries`);

    // Analyze patterns with chunked processing
    const patterns = await analyzePatterns(entries);

    // Save patterns to storage
    await storage.savePatterns(patterns);

    sendResponse({ success: true, data: patterns });
  } catch (error) {
    console.error('Error analyzing patterns:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Process entries in chunks to avoid blocking
 * @param {Array} items - Items to process
 * @param {Function} processor - Function to process each chunk
 * @param {number} chunkSize - Size of each chunk
 */
async function processInChunks(items, processor, chunkSize = 1000) {
  const results = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    // Process chunk
    const result = await new Promise((resolve) => {
      // Use setTimeout to yield to event loop
      setTimeout(() => {
        resolve(processor(chunk));
      }, 0);
    });

    results.push(result);
  }

  return results;
}

/**
 * Analyze patterns from day log entries
 * Uses chunked processing to avoid blocking on large datasets
 * @param {Array} entries - Day log entries from last 7 days
 * @returns {Promise<Object>} Analyzed patterns
 */
async function analyzePatterns(entries) {
  const startTime = Date.now();

  // Process in chunks if dataset is large
  const CHUNK_SIZE = 1000;
  const shouldChunk = entries.length > CHUNK_SIZE;

  if (shouldChunk) {
    console.log(`[Patterns] Large dataset (${entries.length} entries), using chunked processing`);
  }

  // Morning routine (sites visited 6am-10am)
  const morningDomains = {};
  await processInChunks(entries, (chunk) => {
    chunk.forEach(e => {
      const hour = new Date(e.visitedAt).getHours();
      if (hour >= 6 && hour < 10 && e.domain) {
        morningDomains[e.domain] = (morningDomains[e.domain] || 0) + 1;
      }
    });
  }, CHUNK_SIZE);

  const morningRoutine = Object.entries(morningDomains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }));

  // Peak hours (most active hours)
  const hourCounts = {};
  await processInChunks(entries, (chunk) => {
    chunk.forEach(e => {
      const hour = new Date(e.visitedAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + (e.activeTime || 0);
    });
  }, CHUNK_SIZE);

  const peakHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, time]) => ({
      hour: parseInt(hour),
      totalActiveTime: time
    }));

  // Top sites (by active time)
  const siteTimes = {};
  await processInChunks(entries, (chunk) => {
    chunk.forEach(e => {
      if (e.domain) {
        siteTimes[e.domain] = (siteTimes[e.domain] || 0) + (e.activeTime || 0);
      }
    });
  }, CHUNK_SIZE);

  const topSites = Object.entries(siteTimes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, time]) => ({ domain, totalActiveTime: time }));

  // Work clusters (sites visited together in same session)
  const sessionClusters = {};
  await processInChunks(entries, (chunk) => {
    chunk.forEach(e => {
      if (!e.sessionId || !e.domain) return;

      if (!sessionClusters[e.sessionId]) {
        sessionClusters[e.sessionId] = new Set();
      }
      sessionClusters[e.sessionId].add(e.domain);
    });
  }, CHUNK_SIZE);

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

  const duration = Date.now() - startTime;
  console.log(`[Patterns] Analysis completed in ${duration}ms`);

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
 * @param {number} daysBack - Number of days to import (uses default from preferences if not specified)
 * @returns {Promise<Object>} { imported, skipped } counts
 */
async function importChromeHistory(daysBack) {
  const prefs = await storage.getPreferences();
  const days = daysBack || prefs.defaultHistoryImportDays;
  const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);

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

  // Helper function to convert timestamp to local date string
  function toLocalDateString(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Convert to day log entries
  const entries = filtered.map(item => {
    const url = new URL(item.url);
    const actualDate = toLocalDateString(item.lastVisitTime); // Use local timezone
    return {
      url: item.url,
      title: item.title || url.hostname,
      domain: url.hostname,
      content: '',
      extractionType: 'history_import',
      date: actualDate, // Use actual visit date for historical context (standup, week wrap)
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
      // Import history using default lookback period from preferences
      const result = await importChromeHistory();
      console.log(`[OpenOwl] History import finished. Result: ${result.imported} imported, ${result.skipped} skipped.`);
      // No need to store import status - we can derive it from database using getHistoryImportStats()
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
// Today Tab Redesign Handlers
// ============================================

/**
 * Get count of live entries (not history_import)
 */
async function handleGetLiveEntriesCount(sendResponse) {
  try {
    const entries = await storage.getLiveEntries();
    sendResponse({ success: true, data: entries.length });
  } catch (error) {
    console.error('Error getting live entries count:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get count of history import entries
 */
async function handleGetHistoryImportCount(sendResponse) {
  try {
    const entries = await storage.getHistoryImportEntries();
    sendResponse({ success: true, data: entries.length });
  } catch (error) {
    console.error('Error getting history import count:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get history for display (first install state)
 */
async function handleGetHistoryForDisplay(data, sendResponse) {
  try {
    const { days = 14, limit = 30 } = data || {};
    const entries = await storage.getEntriesForHistory(days);

    // Filter for history_import only
    const historyEntries = entries.filter(e => e.source === 'history_import');

    // Sort by date descending
    historyEntries.sort((a, b) => (b.visitedAt || 0) - (a.visitedAt || 0));

    sendResponse({ success: true, data: historyEntries });
  } catch (error) {
    console.error('Error getting history for display:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get work history (active state)
 */
async function handleGetWorkHistory(data, sendResponse) {
  try {
    const { days = 7 } = data || {};
    const entries = await storage.getEntriesForHistory(days);

    sendResponse({ success: true, data: entries });
  } catch (error) {
    console.error('Error getting work history:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get open tabs (simplified for Today tab)
 */
async function handleGetTabs(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({});

    // Filter out chrome:// and extension pages
    const filteredTabs = tabs.filter(tab => {
      const url = tab.url || '';
      return !url.startsWith('chrome://') &&
             !url.startsWith('chrome-extension://') &&
             !url.startsWith('about:');
    });

    sendResponse({ success: true, data: filteredTabs });
  } catch (error) {
    console.error('Error getting tabs:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get last activity date (for morning briefing)
 */
async function handleGetLastActivityDate(sendResponse) {
  try {
    const date = await storage.getLastActivityDate();
    sendResponse({ success: true, data: date });
  } catch (error) {
    console.error('Error getting last activity date:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get live entries today count (for briefing session check)
 */
async function handleGetLiveEntriesTodayCount(sendResponse) {
  try {
    const entries = await storage.getLiveEntriesToday();
    sendResponse({ success: true, data: entries.length });
  } catch (error) {
    console.error('Error getting live entries today count:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get last activity log (for briefing)
 */
async function handleGetLastActivityLog(sendResponse) {
  try {
    const entries = await storage.getLastActivityLog();
    sendResponse({ success: true, data: entries });
  } catch (error) {
    console.error('Error getting last activity log:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Test Ollama connection
 */
async function handleTestOllamaConnection(sendResponse) {
  try {
    const settings = await storage.getSettings();
    const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';

    // Test connection by hitting /api/tags endpoint
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Ollama connection failed' });
    }
  } catch (error) {
    console.warn('Ollama connection test failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Fetch available models from the provider
 * Delegates to the LLM module's fetchModels function
 */
async function handleFetchModels(data, sendResponse) {
  const result = await fetchModels(data);
  sendResponse(result);
}

// ============================================
// Periodic Cleanup
// ============================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanOldLogs') {
    try {
      const prefs = await storage.getPreferences();
      await storage.cleanupOldEntries(prefs.logRetentionDays);
      console.log(`Old logs cleaned successfully (keeping last ${prefs.logRetentionDays} days)`);
    } catch (error) {
      console.error('Error cleaning old logs:', error);
    }
  }
});
