/**
 * Storage abstraction layer for OpenOwl
 * Handles chrome.storage.local for settings/small data and IndexedDB for day logs
 */

import { openDB } from 'idb';

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
    upgrade(db, oldVersion) {
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
  return result.settings || {
    selectedProvider: 'claude',
    selectedModel: 'claude-sonnet-4-20250514',
    apiKeys: {},
    ollamaUrl: 'http://localhost:11434'
  };
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
  if (!date) {
    date = new Date().toISOString().split('T')[0];
  }
  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  const index = tx.store.index('date');
  return index.getAll(date);
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

  // Top domains
  const domainCounts = {};
  entries.forEach(e => {
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
