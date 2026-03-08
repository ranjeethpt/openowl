/**
 * Storage abstraction layer for OpenOwl
 * Handles chrome.storage.local for settings/small data and IndexedDB for day logs
 */

import { openDB } from 'idb';
import { DEFAULT_SETTINGS, DEFAULT_PREFERENCES } from '../constants.js';
export { DEFAULT_SETTINGS, DEFAULT_PREFERENCES };

/**
 * @typedef {Object} CopiedSnippet
 * @property {string} text - The copied text
 * @property {number} timestamp - When it was copied (milliseconds)
 * @property {string} [pastedUrl] - URL where it was pasted (if detected)
 * @property {number} [pastedAt] - When it was pasted (milliseconds)
 */

/**
 * @typedef {Object} DayLogEntry
 * @property {number} id - Auto-generated entry ID
 * @property {string} url - Full URL of the page
 * @property {string} title - Page title
 * @property {string} domain - Domain (e.g., 'github.com')
 * @property {string} content - Extracted page content
 * @property {string} extractionType - Type of extractor used
 * @property {string} date - Date string YYYY-MM-DD
 * @property {number} visitedAt - Timestamp when visited
 * @property {number|null} leftAt - Timestamp when left
 * @property {number} activeTime - Active time in milliseconds
 * @property {number} totalTime - Total time in milliseconds
 * @property {number} scrollDepth - Scroll depth percentage
 * @property {CopiedSnippet[]} copied - Array of copied snippets with metadata
 * @property {boolean} revisited - Whether page was revisited
 * @property {number} visitCount - Number of visits to this URL
 * @property {string} sessionId - Session identifier
 * @property {string} [source] - 'history_import' if imported from browser history
 */

// IndexedDB database name and version
const DB_NAME = 'openowl-db';
const DB_VERSION = 2;
const DAY_LOGS_STORE = 'dayLogs';

/**
 * Initialize IndexedDB with proper schema
 * @returns {Promise<IDBDatabase>}
 */
async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create day logs store if it doesn't exist
      if (!db.objectStoreNames.contains(DAY_LOGS_STORE)) {
        const store = db.createObjectStore(DAY_LOGS_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        // Indexes for efficient querying
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('visitedAt', 'visitedAt', { unique: false });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('domain', 'domain', { unique: false });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    }
  });
}

// ============================================
// Chrome Storage API (for settings, patterns)
// ============================================

/**
 * Save settings to chrome.storage.local
 * @param {Object} settings - { selectedProvider, selectedModel, apiKeys, ollamaUrl }
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  return chrome.storage.local.set({ settings });
}

/**
 * Get settings from chrome.storage.local
 * @returns {Promise<Object>} { selectedProvider, selectedModel, apiKeys, ollamaUrl }
 */
export async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || DEFAULT_SETTINGS;
}

/**
 * Save learned patterns to chrome.storage.local
 * @param {Array} patterns
 * @returns {Promise<void>}
 */
export async function savePatterns(patterns) {
  return chrome.storage.local.set({ patterns });
}

/**
 * Get learned patterns from chrome.storage.local
 * @returns {Promise<Array>}
 */
export async function getPatterns() {
  const result = await chrome.storage.local.get('patterns');
  return result.patterns || [];
}

/**
 * Save preferences to chrome.storage.local
 * @param {Object} preferences - User preferences object
 * @returns {Promise<void>}
 */
export async function savePreferences(preferences) {
  return chrome.storage.local.set({ preferences });
}

/**
 * Get preferences from chrome.storage.local
 * @returns {Promise<Object>} Preferences object with defaults
 */
export async function getPreferences() {
  const result = await chrome.storage.local.get('preferences');

  if (!result.preferences) return DEFAULT_PREFERENCES;

  // Merge defaults to handle partially missing keys from older versions
  return {
    ...DEFAULT_PREFERENCES,
    ...result.preferences,
    workHours: {
      ...DEFAULT_PREFERENCES.workHours,
      ...(result.preferences.workHours || {})
    }
  };
}

// ============================================
// IndexedDB API (for day logs)
// ============================================

/**
 * Save a day log entry to IndexedDB
 * Checks for duplicates within configured time window
 * @param {Object} entry - DayLog entry object
 * @returns {Promise<number>} entry ID
 */
export async function saveDayLogEntry(entry) {
  const db = await initDB();
  const date = new Date(entry.visitedAt).toISOString().split('T')[0]; // YYYY-MM-DD
  const prefs = await getPreferences();

  // Check for duplicate within configured window
  const windowStart = entry.visitedAt - prefs.duplicateVisitWindowMs;
  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  const index = tx.store.index('url');
  const existingEntries = await index.getAll(entry.url);

  const isDuplicate = existingEntries.some(existing =>
    existing.visitedAt > windowStart &&
    existing.visitedAt <= entry.visitedAt
  );

  if (isDuplicate) {
    const windowMinutes = prefs.duplicateVisitWindowMs / (60 * 1000);
    console.log(`[DayLog] Skipping duplicate entry within ${windowMinutes}min window:`, entry.url);
    return null;
  }

  // Save entry
  const fullEntry = {
    url: entry.url,
    title: entry.title || 'Untitled',
    domain: entry.domain,
    content: entry.content || '',
    extractionType: entry.extractionType || 'generic',
    date,
    visitedAt: entry.visitedAt,
    leftAt: entry.leftAt || null,
    activeTime: entry.activeTime || 0,
    totalTime: entry.totalTime || 0,
    scrollDepth: entry.scrollDepth || 0,
    copied: entry.copied || [],
    revisited: entry.revisited || false,
    visitCount: entry.visitCount || 1,
    sessionId: entry.sessionId
  };

  return db.add(DAY_LOGS_STORE, fullEntry);
}

/**
 * Get day log entries for a specific date (defaults to today)
 * @param {string} date - YYYY-MM-DD format (optional, defaults to today)
 * @returns {Promise<DayLogEntry[]>}
 */
export async function getDayLog(date) {
  const db = await initDB();

  if (!date) {
    // Return all entries from today onwards (including those with future dates if any, or just today's)
    // Actually, normally it's just today.
    date = new Date().toISOString().split('T')[0];
  }

  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  const index = tx.store.index('date');
  return index.getAll(date);
}

/**
 * Get all history entries available (for context when needed)
 * @param {number} limit - Max entries
 * @returns {Promise<Array>}
 */
export async function getAllHistory(limit = 100) {
  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  const index = tx.store.index('visitedAt');
  // Get most recent entries
  let cursor = await index.openCursor(null, 'prev');
  const results = [];
  while (cursor && results.length < limit) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }
  return results;
}

/**
 * Get ALL logs across all dates (for memory search)
 * Different from getAllHistory() which has a limit
 * Used by memorySearch to scan full 30 days
 * @returns {Promise<DayLogEntry[]>}
 */
export async function getAllLogs() {
  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  return tx.store.getAll();
}

/**
 * Get yesterday's day log entries
 * @returns {Promise<Array>}
 */
export async function getYesterdayLog() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];
  return getDayLog(date);
}

/**
 * Get all entries within a date range
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array>}
 */
export async function getLogRange(startDate, endDate) {
  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  const index = tx.store.index('date');
  const range = IDBKeyRange.bound(startDate, endDate);
  return index.getAll(range);
}

/**
 * Update an existing day log entry
 * @param {number} id - Entry ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateEntry(id, updates) {
  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readwrite');
  const store = tx.store;

  const entry = await store.get(id);
  if (!entry) {
    console.warn('[DayLog] Entry not found:', id);
    return;
  }

  const updatedEntry = { ...entry, ...updates };
  await store.put(updatedEntry);
  await tx.done;
}

/**
 * Delete old entries (keep only last N days)
 * @param {number} daysToKeep - Number of days to keep (default 30)
 * @returns {Promise<number>} Number of deleted entries
 */
export async function cleanupOldEntries(daysToKeep = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoff = cutoffDate.toISOString().split('T')[0];

  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readwrite');
  const index = tx.store.index('date');
  const range = IDBKeyRange.upperBound(cutoff, true); // exclude cutoff date

  let deleteCount = 0;
  let cursor = await index.openCursor(range);
  while (cursor) {
    await cursor.delete();
    deleteCount++;
    cursor = await cursor.continue();
  }

  await tx.done;
  console.log(`[DayLog] Cleaned up ${deleteCount} old entries (older than ${cutoff})`);
  return deleteCount;
}

/**
 * Import history entries in batch
 * Used for Chrome history import on first install
 * @param {Array} entries - Array of history entries to import
 * @returns {Promise<Object>} { imported, skipped } counts
 */
export async function importHistoryEntries(entries) {
  if (!entries || entries.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  const db = await initDB();
  let imported = 0;
  let skipped = 0;

  // Use a single read-write transaction for batch performance
  const tx = db.transaction(DAY_LOGS_STORE, 'readwrite');
  const store = tx.store;
  const index = store.index('url');

  for (const entry of entries) {
    try {
      // Check if URL already exists for that date
      const existingEntries = await index.getAll(entry.url);

      // Check if any existing entry has the same date
      const dateExists = existingEntries.some(existing => existing.date === entry.date);

      if (dateExists) {
        skipped++;
        continue;
      }

      // Add entry with source marker
      await store.add({
        ...entry,
        source: 'history_import'
      });

      imported++;
    } catch (error) {
      console.warn('[History Import] Failed to import entry:', entry.url, error);
      skipped++;
    }
  }

  await tx.done;
  console.log(`[History Import] Complete: ${imported} imported, ${skipped} skipped`);
  return { imported, skipped };
}

/**
 * Get today's statistics
 * @returns {Promise<Object>} { totalVisits, uniquePages, totalActiveTime, topDomains }
 */
export async function getTodayStats() {
  const entries = await getDayLog();

  if (entries.length === 0) {
    return {
      totalVisits: 0,
      uniquePages: 0,
      totalActiveTime: 0,
      topDomains: []
    };
  }

  // Calculate stats
  const uniqueUrls = new Set(entries.map(e => e.url));
  const totalActiveTime = entries.reduce((sum, e) => sum + (e.activeTime || 0), 0);

  // Filter out history imports for TodayStats as they don't represent today's real activity
  const realEntries = entries.filter(e => e.source !== 'history_import');

  // Top domains
  const domainCounts = {};
  realEntries.forEach(e => {
    if (e.domain) {
      domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1;
    }
  });

  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }));

  return {
    totalVisits: entries.length,
    uniquePages: uniqueUrls.size,
    totalActiveTime,
    topDomains
  };
}

/**
 * Get meaningful history for AI context
 * Filters and sorts by importance (active time)
 * @param {number} limit - Max entries to return (default 20)
 * @returns {Promise<Array>} Filtered and sorted entries
 */
export async function getMeaningfulHistory(limit = 20) {
  // If no limit or small limit, we can just look at today's log.
  // But if we want more context, we should look at recent history in general.
  const entries = await getAllHistory(200);
  const preferences = await getPreferences();

  // Filter meaningful entries
  const filtered = entries.filter(entry => {
    // Must have meaningful active time (>=minActiveTimeMs) OR be from history import
    const isMeaningful = (entry.activeTime && entry.activeTime >= preferences.minActiveTimeMs) || entry.source === 'history_import';
    if (!isMeaningful) return false;

    // Skip internal URLs
    if (!entry.url ||
        entry.url.startsWith('chrome://') ||
        entry.url.startsWith('chrome-extension://') ||
        entry.url.startsWith('about:')) {
      return false;
    }

    // Skip never-track domains
    const hostname = entry.domain || '';
    return !preferences.neverTrack.some(d => hostname.includes(d));


  });

  // Sort by Importance (Active time > History import)
  filtered.sort((a, b) => {
    // If one is history import and other isn't, prefer non-import (live) if it has more time
    // But generally just sort by activeTime.
    // However, history_import has 0 activeTime, so they'll all be at the bottom.
    // Let's sort by visitedAt if activeTime is equal (like 0)
    if ((b.activeTime || 0) === (a.activeTime || 0)) {
      return (b.visitedAt || 0) - (a.visitedAt || 0);
    }
    return (b.activeTime || 0) - (a.activeTime || 0);
  });

  // Return top entries
  return filtered.slice(0, limit);
}

/**
 * Get last activity log (most recent day with real activity)
 * Excludes today, history_import, and accidental opens
 * Falls back to history_import if no real activity exists
 * @returns {Promise<Array>} Entries from last active day, or empty array
 */
export async function getLastActivityLog() {
  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  const index = tx.store.index('date');

  const today = new Date().toISOString().split('T')[0];

  // Get all entries, sorted by date descending
  const allEntries = await tx.store.getAll();

  console.log('[getLastActivityLog] Total entries:', allEntries.length);
  console.log('[getLastActivityLog] Today:', today);

  // Group by date
  const byDate = {};
  allEntries.forEach(entry => {
    if (!byDate[entry.date]) {
      byDate[entry.date] = [];
    }
    byDate[entry.date].push(entry);
  });

  // Get dates sorted descending (most recent first)
  const dates = Object.keys(byDate).sort().reverse();
  console.log('[getLastActivityLog] All dates:', dates);

  // Find most recent date (excluding today) that has real activity
  for (const date of dates) {
    if (date === today) continue; // Skip today

    const entries = byDate[date];

    // Check if this date has real activity
    // Real activity = NOT history_import AND (activeTime > 0 OR visitCount > 1)
    const hasRealActivity = entries.some(e =>
      e.source !== 'history_import' &&
      (e.activeTime > 0 || e.visitCount > 1)
    );

    console.log(`[getLastActivityLog] Date ${date}: ${entries.length} entries, hasRealActivity=${hasRealActivity}`);

    if (hasRealActivity) {
      console.log('[getLastActivityLog] Returning real activity from:', date);
      return entries;
    }
  }

  // No real activity found - fall back to history_import
  for (const date of dates) {
    if (date === today) continue;

    const entries = byDate[date];
    const hasHistoryImport = entries.some(e => e.source === 'history_import');

    if (hasHistoryImport) {
      console.log('[getLastActivityLog] Falling back to history_import from:', date);
      return entries;
    }
  }

  // Nothing at all
  console.log('[getLastActivityLog] No entries found at all');
  return [];
}

/**
 * Get last activity date (most recent day with real activity)
 * @returns {Promise<string|null>} Date string (YYYY-MM-DD) or null
 */
export async function getLastActivityDate() {
  const entries = await getLastActivityLog();

  if (entries.length === 0) return null;

  return entries[0].date;
}

/**
 * Get week log (Monday to today, or last 7 days if nothing this week)
 * @returns {Promise<Array>} Entries from current week
 */
export async function getWeekLog() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Calculate Monday of current week
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);
  const mondayStr = monday.toISOString().split('T')[0];

  // Get entries from Monday to today
  const entries = await getLogRange(mondayStr, todayStr);

  // If nothing found this week, fall back to last 7 days
  if (entries.length === 0) {
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    return getLogRange(sevenDaysAgoStr, todayStr);
  }

  return entries;
}

/**
 * Get history import stats (derived from database)
 * @returns {Promise<Object|null>} { entriesImported, oldestDate, newestDate, daysSpan } or null if no import
 */
export async function getHistoryImportStats() {
  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  const allEntries = await tx.store.getAll();

  const historyEntries = allEntries.filter(e => e.source === 'history_import');

  if (historyEntries.length === 0) {
    return null;
  }

  // Get date range
  const dates = historyEntries.map(e => e.date).sort();
  const oldestDate = dates[0];
  const newestDate = dates[dates.length - 1];

  // Calculate days span
  const oldestTime = new Date(oldestDate).getTime();
  const newestTime = new Date(newestDate).getTime();
  const daysSpan = Math.ceil((newestTime - oldestTime) / (1000 * 60 * 60 * 24));

  return {
    entriesImported: historyEntries.length,
    oldestDate,
    newestDate,
    daysSpan: daysSpan + 1 // +1 to include both start and end days
  };
}

/**
 * Get all copied snippets from today
 * @returns {Promise<Array>} Array of {text, timestamp, domain, url, sourceUrl}
 */
export async function getCopiedSnippets() {
  const entries = await getDayLog();

  // Find all entries with copied content
  const snippets = [];

  for (const entry of entries) {
    if (entry.copied && Array.isArray(entry.copied) && entry.copied.length > 0) {
      for (const copiedItem of entry.copied) {
        snippets.push({
          text: copiedItem.text,
          timestamp: copiedItem.timestamp,
          domain: entry.domain,
          url: entry.url,
          sourceUrl: entry.url,
          pastedUrl: copiedItem.pastedUrl,
          pastedAt: copiedItem.pastedAt
        });
      }
    }
  }

  // Sort by timestamp descending (most recent first)
  snippets.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return snippets;
}

// ============================================
// Insight Caching (chrome.storage.local)
// ============================================

/**
 * Cache LLM-generated insight for today
 * @param {string} date - YYYY-MM-DD format
 * @param {string} text - Insight text from LLM
 * @returns {Promise<void>}
 */
export async function cacheInsight(date, text) {
  const cache = {
    date,
    text,
    generatedAt: new Date().toISOString()
  };

  return chrome.storage.local.set({ [`insight_${date}`]: cache });
}

/**
 * Get cached insight for today (12-hour TTL)
 * @param {string} date - YYYY-MM-DD format
 * @returns {Promise<{text: string, generatedAt: string} | null>}
 */
export async function getCachedInsight(date) {
  const result = await chrome.storage.local.get([`insight_${date}`]);
  const cached = result[`insight_${date}`];

  if (!cached) return null;

  // Check if cache is still valid
  const prefs = await getPreferences();
  const generatedAt = new Date(cached.generatedAt).getTime();
  const now = Date.now();
  const age = now - generatedAt;

  if (age > prefs.insightCacheTtlMs) {
    const ttlHours = prefs.insightCacheTtlMs / (60 * 60 * 1000);
    console.log(`[Cache] Insight cache expired after ${ttlHours} hours`);
    // Cache expired, clean up
    await chrome.storage.local.remove([`insight_${date}`]);
    return null;
  }

  return cached;
}

/**
 * Clear all cached insights (for testing/debugging)
 * @returns {Promise<void>}
 */
export async function clearInsightCache() {
  const allData = await chrome.storage.local.get(null);
  const insightKeys = Object.keys(allData).filter(k => k.startsWith('insight_'));

  if (insightKeys.length > 0) {
    await chrome.storage.local.remove(insightKeys);
  }
}

// ============================================
// Custom Templates Storage
// ============================================

/**
 * Get entries for a specific time range
 * @param {Object} timeRange - Time range configuration { type, n? }
 * @returns {Promise<Array>} Entries matching the time range
 */
export async function getEntriesForRange(timeRange) {
  try {
    if (!timeRange || !timeRange.type) {
      return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate, endDate;

    switch (timeRange.type) {
      case 'today':
        startDate = new Date(today);
        endDate = new Date();
        break;

      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(today);
        endDate.setMilliseconds(-1);
        break;

      case 'last_n_days':
        const n = timeRange.n || 7;
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - n);
        endDate = new Date();
        break;

      case 'this_week':
        // Monday of current week to today
        const dayOfWeek = today.getDay();
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(today);
        startDate.setDate(today.getDate() - daysFromMonday);
        endDate = new Date();
        break;

      case 'last_week':
        // Monday to Sunday of last week
        const lastWeekEnd = new Date(today);
        const daysSinceMonday = today.getDay() === 0 ? 6 : today.getDay() - 1;
        lastWeekEnd.setDate(today.getDate() - daysSinceMonday - 1); // Last Sunday
        lastWeekEnd.setHours(23, 59, 59, 999);

        startDate = new Date(lastWeekEnd);
        startDate.setDate(lastWeekEnd.getDate() - 6); // Last Monday
        startDate.setHours(0, 0, 0, 0);

        endDate = lastWeekEnd;
        break;

      default:
        return [];
    }

    // Get all entries from IndexedDB
    const allEntries = await getAllLogs();

    // Filter by date range
    const filtered = allEntries.filter(entry => {
      const entryDate = new Date(entry.visitedAt);
      return entryDate >= startDate && entryDate <= endDate;
    });

    return filtered;
  } catch (error) {
    console.error('[getEntriesForRange] Error:', error);
    return [];
  }
}

/**
 * Get all custom templates from storage
 * @returns {Promise<Array>} Array of custom templates
 */
export async function getCustomTemplates() {
  try {
    const result = await chrome.storage.local.get('customTemplates');
    return result.customTemplates || [];
  } catch (error) {
    console.error('[getCustomTemplates] Error:', error);
    return [];
  }
}

/**
 * Save a custom template (create or update)
 * @param {Object} template - Template object
 * @returns {Promise<Object|null>} Saved template or null on failure
 */
export async function saveCustomTemplate(template) {
  try {
    // Generate ID if new template
    if (!template.id) {
      template.id = crypto.randomUUID();
      template.createdAt = Date.now();
    }

    // Get existing templates
    const existing = await getCustomTemplates();

    // Check if updating existing
    const index = existing.findIndex(t => t.id === template.id);

    if (index >= 0) {
      // Update existing
      existing[index] = template;
    } else {
      // Add new
      existing.push(template);
    }

    // Save back to storage
    await chrome.storage.local.set({ customTemplates: existing });

    return template;
  } catch (error) {
    console.error('[saveCustomTemplate] Error:', error);
    return null;
  }
}

/**
 * Delete a custom template by ID
 * @param {string} id - Template ID
 * @returns {Promise<void>}
 */
export async function deleteCustomTemplate(id) {
  try {
    const existing = await getCustomTemplates();
    const filtered = existing.filter(t => t.id !== id);
    await chrome.storage.local.set({ customTemplates: filtered });
  } catch (error) {
    console.error('[deleteCustomTemplate] Error:', error);
    // Silently fail - no-op
  }
}

/**
 * Update a custom template by ID
 * @param {string} id - Template ID
 * @param {Object} changes - Fields to update
 * @returns {Promise<void>}
 */
export async function updateCustomTemplate(id, changes) {
  try {
    const existing = await getCustomTemplates();
    const index = existing.findIndex(t => t.id === id);

    if (index >= 0) {
      existing[index] = { ...existing[index], ...changes };
      await chrome.storage.local.set({ customTemplates: existing });
    }
    // No-op if not found
  } catch (error) {
    console.error('[updateCustomTemplate] Error:', error);
    // Silently fail - no-op
  }
}

// ============================================
// Today Tab Redesign Functions
// ============================================

/**
 * Get all live entries (not history_import)
 * @returns {Promise<Array>} All live entries across all dates
 */
export async function getLiveEntries() {
  try {
    const db = await initDB();
    const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
    const allEntries = await tx.store.getAll();

    return allEntries.filter(entry => entry.source !== 'history_import');
  } catch (error) {
    console.error('[getLiveEntries] Error:', error);
    return [];
  }
}

/**
 * Get live entries for today only
 * @returns {Promise<Array>} Today's live entries
 */
export async function getLiveEntriesToday() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const entries = await getDayLog(today);

    return entries.filter(entry => entry.source !== 'history_import');
  } catch (error) {
    console.error('[getLiveEntriesToday] Error:', error);
    return [];
  }
}

/**
 * Get all history_import entries
 * @returns {Promise<Array>} All history import entries
 */
export async function getHistoryImportEntries() {
  try {
    const db = await initDB();
    const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
    const allEntries = await tx.store.getAll();

    return allEntries.filter(entry => entry.source === 'history_import');
  } catch (error) {
    console.error('[getHistoryImportEntries] Error:', error);
    return [];
  }
}

/**
 * Get entries for Work History section (last N days)
 * Combines live and history_import, sorted by date and visitedAt descending
 * @param {number} days - Number of days to look back (default 7)
 * @returns {Promise<Array>} Entries sorted by date desc, then visitedAt desc
 */
export async function getEntriesForHistory(days = 7) {
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = today.toISOString().split('T')[0];

    const entries = await getLogRange(startDateStr, endDateStr);

    // Sort by visitedAt descending (most recent first)
    entries.sort((a, b) => (b.visitedAt || 0) - (a.visitedAt || 0));

    return entries;
  } catch (error) {
    console.error('[getEntriesForHistory] Error:', error);
    return [];
  }
}
