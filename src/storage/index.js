/**
 * Storage abstraction layer for OpenOwl
 * Handles chrome.storage.local for settings/small data and IndexedDB for day logs
 */

import { openDB } from 'idb';
import { DEFAULT_SETTINGS, DEFAULT_PREFERENCES } from '../constants.js';
export { DEFAULT_SETTINGS, DEFAULT_PREFERENCES };

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
 * Checks for duplicates within 5 minutes window
 * @param {Object} entry - DayLog entry object
 * @returns {Promise<number>} entry ID
 */
export async function saveDayLogEntry(entry) {
  const db = await initDB();
  const date = new Date(entry.visitedAt).toISOString().split('T')[0]; // YYYY-MM-DD

  // Check for duplicate within 5 minutes
  const fiveMinutesAgo = entry.visitedAt - (5 * 60 * 1000);
  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  const index = tx.store.index('url');
  const existingEntries = await index.getAll(entry.url);

  const isDuplicate = existingEntries.some(existing =>
    existing.visitedAt > fiveMinutesAgo &&
    existing.visitedAt <= entry.visitedAt
  );

  if (isDuplicate) {
    console.log('[DayLog] Skipping duplicate entry within 5min window:', entry.url);
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
 * @returns {Promise<Array>}
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
 * Get all copied snippets from today
 * @returns {Promise<Array>} Array of {snippet, domain, url, visitedAt}
 */
export async function getCopiedSnippets() {
  const entries = await getDayLog();

  // Find all entries with copied content
  const snippets = [];

  for (const entry of entries) {
    if (entry.copied && Array.isArray(entry.copied) && entry.copied.length > 0) {
      for (const snippet of entry.copied) {
        snippets.push({
          snippet,
          domain: entry.domain,
          url: entry.url,
          visitedAt: entry.visitedAt
        });
      }
    }
  }

  // Sort by visitedAt descending (most recent first)
  snippets.sort((a, b) => (b.visitedAt || 0) - (a.visitedAt || 0));

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

  // Check if cache is still valid (12 hours = 43200000 ms)
  const generatedAt = new Date(cached.generatedAt).getTime();
  const now = Date.now();
  const age = now - generatedAt;
  const TTL = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

  if (age > TTL) {
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
