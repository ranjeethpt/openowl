/**
 * Template System - User-facing quick actions in the Ask tab
 *
 * ARCHITECTURE OVERVIEW:
 * Templates are UI buttons that gather context and invoke prompts from the registry.
 * NOT all prompts have templates (e.g., dayInsight is used by Today tab internally).
 *
 * Flow:
 * 1. User clicks template button in Ask tab (e.g., "✍️ Write standup")
 * 2. Template's gather() function collects required data (logs, tabs, etc.)
 * 3. Template references a prompt by name string: prompt: 'standup'
 * 4. background.js calls getPrompt(template.prompt, gatherData)
 * 5. LLM receives built system prompt + user message
 *
 * Template Types:
 * - auto:   Click → runs immediately, gathers data, calls LLM
 * - prompt: Click → prefills input, user completes and submits
 *
 * Adding a New Template:
 * 1. Add prompt to registry.js (e.g., myFeature: { build: ... })
 * 2. Add template below with label, type, triggers, gather(), prompt: 'myFeature'
 * 3. Test in Ask tab - click button and verify output
 */
import * as storage from '../storage/index.js';
import { searchMemory } from '../utils/memorySearch.js';

// Helper to get meaningful history with preferences filtering
async function getMeaningfulHistory(limit = 50) {
  const history = await storage.getAllHistory(limit);
  const preferences = await storage.getPreferences();

  if (!preferences?.neverTrack?.length) return history;

  return history.filter(entry =>
    !preferences.neverTrack.some(d => entry.domain?.includes(d))
  );
}

// Helper to get copied snippets
async function getCopiedSnippets() {
  const history = await storage.getAllHistory(50);
  return history
    .filter(e => e.copied && e.copied.length > 0)
    .slice(0, 10);
}

// Helper to get today's stats
async function getTodayStats() {
  const dayLog = await storage.getDayLog();
  const totalActiveTime = dayLog.reduce((sum, e) => sum + (e.activeTime || 0), 0);
  const totalVisits = dayLog.reduce((sum, e) => sum + (e.visitCount || 1), 0);
  const uniquePages = new Set(dayLog.map(e => e.url)).size;

  return { totalActiveTime, totalVisits, uniquePages };
}

// Helper to get all open tabs
async function getAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return tabs.map(t => ({
      title: t.title,
      url: t.url,
      active: t.active
    }));
  } catch (err) {
    console.error('Error getting tabs:', err);
    return [];
  }
}

export const TEMPLATES = {

  standup: {
    label: '✍️ Write standup',
    type: 'auto',
    category: 'daily',
    triggers: ['standup', 'stand up',
               'daily update', 'scrum update'],
    gather: async () => {
      const [todayLog, lastActivityLog,
             copies, prefs] = await Promise.all([
        getMeaningfulHistory(50),
        storage.getLastActivityLog(),
        getCopiedSnippets(),
        storage.getPreferences()
      ]);

      // Calculate human label for last activity date
      let lastDayLabel = 'Yesterday';
      let isFirstRun = false;

      if (lastActivityLog.length === 0) {
        isFirstRun = true;
      } else {
        const lastDate = lastActivityLog[0].date;
        const today = new Date();
        const lastDay = new Date(lastDate);

        // Calculate days ago
        const diffTime = today - lastDay;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          lastDayLabel = 'Yesterday';
        } else if (diffDays === 2 || diffDays === 3) {
          // Day name only (e.g., "Friday")
          lastDayLabel = lastDay.toLocaleDateString('en-US', { weekday: 'long' });
        } else if (diffDays >= 4) {
          // Day + date (e.g., "Monday 24 Feb")
          lastDayLabel = lastDay.toLocaleDateString('en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'short'
          });
        }
      }

      return {
        todayLog,
        lastActivityLog,
        copies,
        format: prefs.standupFormat || 'bullets',
        lastDayLabel,
        isFirstRun
      };
    },
    prompt: 'standup'
  },

  daySummary: {
    label: '📊 Day summary',
    type: 'auto',
    category: 'daily',
    triggers: ['day summary', 'what did i do',
               'summarise today', 'recap today',
               'summary of today'],
    gather: async () => ({
      todayLog: await getMeaningfulHistory(50),
      todayStats: await getTodayStats()
    }),
    prompt: 'summary'
  },

  focus: {
    label: '🎯 What to focus on?',
    type: 'auto',
    category: 'daily',
    triggers: ['focus', 'what should i work on',
               'priority', 'what next',
               'where should i start',
               'what to focus'],
    gather: async () => ({
      tabs: await getAllTabs(),
      todayLog: await getMeaningfulHistory(20),
      copies: await getCopiedSnippets()
    }),
    prompt: 'focus'
  },

  remind: {
    label: '🔍 Remind me of...',
    type: 'prompt',
    prefill: 'Remind me of ',
    category: 'memory',
    triggers: ['remind me', 'i remember',
               'i was looking at', "can't find",
               'what was that', 'find something',
               'few days ago', 'last week',
               'i saw something about',
               'what did i find'],
    // gather receives the full question because user typed the rest
    gather: async (question) => ({
      matches: await searchMemory(question, storage.getAllLogs),
      question
    }),
    prompt: 'memorySearch'
  },

  meetingPrep: {
    label: '📅 Prep for...',
    type: 'prompt',
    prefill: 'Prep me for ',
    category: 'focus',
    triggers: ['prep me for', 'meeting prep',
               'about to have', 'meeting in',
               'prep for', 'getting ready for'],
    gather: async (question) => ({
      todayLog: await getMeaningfulHistory(30),
      yesterdayLog: await storage.getYesterdayLog(),
      tabs: await getAllTabs(),
      question
    }),
    prompt: 'meetingPrep'
  },

  weekWrap: {
    label: '📅 Week wrap',
    type: 'auto',
    category: 'weekly',
    triggers: ['week wrap', 'weekly summary',
               'what did i ship', 'end of week',
               'this week', 'week summary'],
    gather: async () => {
      const weekLog = await storage.getWeekLog();

      // Check if any activity exists (including history_import as fallback)
      const hasRealActivity = weekLog.some(e =>
        e.source !== 'history_import' &&
        (e.activeTime > 0 || e.visitCount > 1)
      );

      const hasHistoryImport = weekLog.some(e => e.source === 'history_import');

      // Has activity if either real activity OR history import exists
      const hasActivity = hasRealActivity || hasHistoryImport;

      return {
        weekLog,
        hasActivity,
        isHistoryOnly: !hasRealActivity && hasHistoryImport
      };
    },
    prompt: 'weekSummary'
  }
};
