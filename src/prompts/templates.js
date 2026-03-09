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
import { buildCustomGatherer } from '../utils/customTemplateRunner.js';

export const TEMPLATES = {

  standup: {
    label: '✍️ Write standup',
    type: 'auto',
    category: 'daily',
    copyable: true,
    triggers: ['standup', 'stand up',
               'daily update', 'scrum update'],
    gather: async () => {
      // Use unified gatherer for consistency
      const todayResult = await buildCustomGatherer({
        timeRange: { type: 'today' },
        domains: [],
        source: 'both',
        includeTabs: false,
        minActiveMinutes: 0,
        minVisitCount: 1
      });

      const lastActivityLog = await storage.getLastActivityLog();
      const prefs = await storage.getPreferences();

      // Get copied snippets from entries
      const copies = todayResult.entries
        .filter(e => e.copied && e.copied.length > 0)
        .slice(0, 10)
        .map(e => {
          const copiedText = typeof e.copied[0] === 'string'
            ? e.copied[0]
            : e.copied[0]?.text || '';
          return {
            snippet: copiedText,
            domain: e.domain,
            url: e.url,
            visitedAt: e.visitedAt
          };
        });

      // Calculate human label for last activity date
      let lastDayLabel = 'Yesterday';
      let isFirstRun = false;

      if (lastActivityLog.length === 0) {
        isFirstRun = true;
      } else {
        const lastDate = lastActivityLog[0].date;
        const today = new Date();
        const lastDay = new Date(lastDate);

        const diffTime = today - lastDay;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          lastDayLabel = 'Yesterday';
        } else if (diffDays === 2 || diffDays === 3) {
          lastDayLabel = lastDay.toLocaleDateString('en-US', { weekday: 'long' });
        } else if (diffDays >= 4) {
          lastDayLabel = lastDay.toLocaleDateString('en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'short'
          });
        }
      }

      return {
        todayLog: todayResult.entries,
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
    copyable: true,
    triggers: ['day summary', 'what did i do',
               'summarise today', 'recap today',
               'summary of today'],
    gather: async () => {
      const result = await buildCustomGatherer({
        timeRange: { type: 'today' },
        domains: [],
        source: 'both',
        includeTabs: false,
        minActiveMinutes: 0,
        minVisitCount: 1
      });

      // Calculate stats from entries
      const totalActiveTime = result.entries.reduce((sum, e) => sum + (e.activeTime || 0), 0);
      const totalVisits = result.entries.reduce((sum, e) => sum + (e.visitCount || 1), 0);
      const uniquePages = new Set(result.entries.map(e => e.url)).size;

      return {
        todayLog: result.entries,
        todayStats: { totalActiveTime, totalVisits, uniquePages }
      };
    },
    prompt: 'summary'
  },

  focus: {
    label: '🎯 What to focus on?',
    type: 'auto',
    category: 'daily',
    copyable: true,
    triggers: ['focus', 'what should i work on',
               'priority', 'what next',
               'where should i start',
               'what to focus'],
    gather: async () => {
      const result = await buildCustomGatherer({
        timeRange: { type: 'today' },
        domains: [],
        source: 'both',
        includeTabs: true,
        minActiveMinutes: 0,
        minVisitCount: 1
      });

      // Get copied snippets from entries
      const copies = result.entries
        .filter(e => e.copied && e.copied.length > 0)
        .slice(0, 5);

      return {
        tabs: result.tabs,
        todayLog: result.entries.slice(0, 20),
        copies
      };
    },
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
    gather: async (question) => {
      const [todayResult, yesterdayResult] = await Promise.all([
        buildCustomGatherer({
          timeRange: { type: 'today' },
          domains: [],
          source: 'both',
          includeTabs: true,
          minActiveMinutes: 0,
          minVisitCount: 1
        }),
        buildCustomGatherer({
          timeRange: { type: 'yesterday' },
          domains: [],
          source: 'both',
          includeTabs: false,
          minActiveMinutes: 0,
          minVisitCount: 1
        })
      ]);

      return {
        todayLog: todayResult.entries.slice(0, 30),
        yesterdayLog: yesterdayResult.entries,
        tabs: todayResult.tabs,
        question
      };
    },
    prompt: 'meetingPrep'
  },

  weekWrap: {
    label: '📅 Week wrap',
    type: 'auto',
    category: 'weekly',
    copyable: true,
    triggers: ['week wrap', 'weekly summary',
               'what did i ship', 'end of week',
               'this week', 'week summary'],
    gather: async () => {
      const result = await buildCustomGatherer({
        timeRange: { type: 'this_week' },
        domains: [],
        source: 'both',
        includeTabs: false,
        minActiveMinutes: 0,
        minVisitCount: 1
      });

      // Check if any activity exists (including history_import as fallback)
      const hasRealActivity = result.entries.some(e =>
        e.source !== 'history_import' &&
        (e.activeTime > 0 || e.visitCount > 1)
      );

      const hasHistoryImport = result.entries.some(e => e.source === 'history_import');

      // Has activity if either real activity OR history import exists
      const hasActivity = hasRealActivity || hasHistoryImport;

      return {
        weekLog: result.entries,
        hasActivity,
        isHistoryOnly: !hasRealActivity && hasHistoryImport
      };
    },
    prompt: 'weekSummary'
  }
};

/**
 * Get all templates (built-in + custom)
 * @returns {Promise<Array>} Combined array of all templates
 */
export async function getAllTemplates() {
  try {
    // Start with built-in templates as array
    const builtIn = Object.entries(TEMPLATES).map(([key, template]) => ({
      ...template,
      key,
      isCustom: false
    }));

    // Load custom templates
    let customTemplates = [];
    try {
      customTemplates = await storage.getCustomTemplates();
    } catch (error) {
      console.warn('[getAllTemplates] Failed to load custom templates:', error);
      // Continue with empty array
    }

    // Convert custom templates to built-in shape
    const customAsBuiltIn = customTemplates.map(template => ({
      label: `${template.icon || '📋'} ${template.name}`,
      type: 'auto', // Custom templates always run immediately
      category: 'custom',
      isCustom: true,
      id: template.id,
      triggers: [template.name.toLowerCase()],
      gather: async () => buildCustomGatherer(template.filters),
      prompt: 'customTemplate',
      promptConfig: template
    }));

    // Return combined array
    return [...builtIn, ...customAsBuiltIn];
  } catch (error) {
    console.error('[getAllTemplates] Critical error:', error);
    // Fall back to built-in only
    return Object.entries(TEMPLATES).map(([key, template]) => ({
      ...template,
      key,
      isCustom: false
    }));
  }
}
