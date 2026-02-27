/**
 * Storage abstraction layer for OpenOwl
 * Handles chrome.storage.local for settings/small data and IndexedDB for day logs
 */

import { openDB } from 'idb';

// IndexedDB database name and version
const DB_NAME = 'openowl-db';
const DB_VERSION = 1;
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
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('url', 'url', { unique: false });
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
 * Log a visit to IndexedDB
 * @param {Object} entry - { url, title, content, timestamp }
 * @returns {Promise<void>}
 */
export async function logVisit(entry) {
  const db = await initDB();
  const date = new Date(entry.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD

  await db.add(DAY_LOGS_STORE, {
    ...entry,
    date
  });
}

/**
 * Get day log entries for a specific date
 * @param {string} date - YYYY-MM-DD format
 * @returns {Promise<Array>}
 */
export async function getDayLog(date) {
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
 * Get today's day log entries
 * @returns {Promise<Array>}
 */
export async function getTodayLog() {
  const today = new Date().toISOString().split('T')[0];
  return getDayLog(today);
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
 * Delete old entries (keep only last N days)
 * @param {number} daysToKeep - Number of days to keep
 * @returns {Promise<void>}
 */
export async function cleanOldLogs(daysToKeep = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoff = cutoffDate.toISOString().split('T')[0];

  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readwrite');
  const index = tx.store.index('date');
  const range = IDBKeyRange.upperBound(cutoff, true); // exclude cutoff date

  let cursor = await index.openCursor(range);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
}

/**
 * Get count of entries for a specific date
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<number>}
 */
export async function getLogCount(date) {
  const db = await initDB();
  const tx = db.transaction(DAY_LOGS_STORE, 'readonly');
  const index = tx.store.index('date');
  return index.count(date);
}
