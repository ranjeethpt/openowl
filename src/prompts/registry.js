/**
 * PROMPT REGISTRY - LLM System Instructions
 *
 * This is the single source of truth for ALL AI prompts in OpenOwl.
 *
 * ARCHITECTURE:
 * Relationship to Templates:
 *   Templates → UI buttons that reference prompts by name string
 *   Prompts → LLM instructions (may or may not have templates)
 *
 * Example flows:
 *
 *   WITH TEMPLATE:
 *   User clicks "✍️ Write standup" button
 *     → standup template's gather() runs
 *     → template.prompt is 'standup' string
 *     → getPrompt('standup', gatheredData)
 *     → This registry builds the system prompt
 *     → LLM called
 *
 *   WITHOUT TEMPLATE:
 *   Today tab loads
 *     → Component calls getPrompt('dayInsight', { dayLog, stats })
 *     → This registry builds the system prompt
 *     → LLM called
 *
 * IMPORTANT:
 * - Templates reference prompts using simple strings: prompt: 'standup'
 * - Not every prompt has a template (dayInsight, ask, briefing, etc.)
 * - Templates are only for common user-triggered actions
 * - Runtime validation ensures prompt names are valid
 *
 * See: src/prompts/README.md for architecture details
 * See: src/prompts/templates/README.md for template guide
 *
 * To add a new prompt:
 * 1. Add entry here: myFeature: { version, description, build() }
 * 2. build() receives context, returns { system, user?, maxTokens }
 * 3. (Optional) Add template in templates.js with prompt: 'myFeature'
 *
 * To edit a prompt:
 * 1. Find it by name in this file
 * 2. Edit the template string
 * 3. Bump version number
 * 4. Submit PR with before/after examples
 */

import { getDisplayName } from '../content/extractors/registry.js';

/**
 * Shared helper for formatting log entries.
 * Handles both live (active tracked) and history_import (from browser history) entries.
 * @param {Array} entries - Activity log entries
 * @param {boolean} [showUrl=false] - For history entries, show URL + visitCount instead of grouped domains
 * @returns {string} Formatted string for prompts
 */
function formatLogEntries(entries, showUrl = false) {
  if (!entries || entries.length === 0) return 'No activity';

  if (showUrl) {
    // For history entries - show URL + visitCount
    return entries.map(e =>
      `- ${e.title}
      URL: ${e.url}
      Visited ${e.visitCount || 1} time(s)`
    ).join('\n');
  }

  // For live entries - group by domain for better readability
  const byDomain = {};
  entries.forEach(entry => {
    const domain = entry.domain || 'unknown';
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(entry);
  });

  return Object.entries(byDomain).map(([domain, entries]) => {
    const displayName = getDisplayName(domain);
    const titles = entries.map(e => e.title).slice(0, 3);
    const timeSpent = entries.reduce((sum, e) => sum + (e.activeTime || 0), 0);
    const timeStr = timeSpent > 0 ? ` (${Math.round(timeSpent / 60000)}m active)` : '';
    return `- ${displayName}: ${titles.join(', ')}${timeStr}`;
  }).join('\n');
}

/**
 * @typedef {Object} ExtractedContent
 * @property {string} url
 * @property {string} title
 * @property {string} domain
 * @property {string} content
 * @property {string} type
 * @property {string} extractionMethod
 * @property {Object} metadata
 */

/**
 * @typedef {Object} PromptResult
 * @property {string} system - System prompt
 * @property {string} [user] - Optional pre-filled user message
 * @property {number} maxTokens - Suggested token limit
 */

/**
 * Prompt Registry - All prompts with their builders
 */
export const PromptRegistry = {
  /**
   * General questions about open tabs and work
   */
  ask: {
    version: '2.1.0',
    description: 'General questions with full context (tabs + history + copies)',

    /**
     * @param {Object} context
     * @param {ExtractedContent[]} context.tabs - Open tabs
     * @param {number} context.tabCount - Tabs being used
     * @param {number} context.totalTabs - Total tabs open
     * @param {Array} [context.history] - Today's meaningful history
     * @param {Array} [context.copies] - Copied snippets
     * @returns {PromptResult}
     */
    build: (context) => {
      const { tabs = [], tabCount = 0, totalTabs = 0, history = [], copies = [] } = context;

      const tabsContext = tabs.length > 0
        ? tabs.map((tab) =>
            `[${tab.active ? 'ACTIVE TAB' : 'tab'}] ${tab.title}
${tab.url}
${tab.content || '(no content extracted)'}${tab.compressed ? ' (truncated)' : ''}`
          ).join('\n---\n')
        : '(no tabs)';

      const historyContext = history.length > 0
        ? history.map(e =>
            `- ${e.domain}: ${e.title}
      URL: ${e.url}
      Time: ${Math.round((e.activeTime || 0) / 60000)}m active
      Visits: ${e.visitCount || 1}
      ${e.source === 'history_import' ? '(from browser history)' : ''}
      ${e.copied?.length > 0 ? `Copied: "${e.copied[0]}"` : ''}`
          ).join('\n')
        : '';

      const copiesContext = copies.length > 0
        ? copies.map(c => `- "${c.snippet}" (${c.domain})`).join('\n')
        : '';

      const system = `You are OpenOwl, AI assistant
built into the developer's Chrome browser.
You have richer context than other AI tools.

CURRENTLY OPEN (${tabCount} of ${totalTabs} tabs):
${tabsContext}

${historyContext ? `TODAY'S WORK HISTORY (most time spent first):
${historyContext}
` : ''}
${copiesContext ? `SNIPPETS COPIED FROM PAGES TODAY:
${copiesContext}
` : ''}
Rules:
- Reference BOTH tabs AND history in answers
- Time spent = importance signal
- Copied content = highest priority signal
- Be specific, not generic
- You are talking to a developer`;

      return {
        system,
        maxTokens: 1000
      };
    }
  },

  /**
   * Generate daily standup from activity
   */
  standup: {
    version: '3.0.0',
    description: 'Generate daily standup from day log activity with format support',

    /**
     * @param {Object} context
     * @param {Array} context.todayLog - Today's day log entries with full metadata
     * @param {Array} [context.yesterdayLog] - Yesterday's day log entries
     * @param {Array} [context.copies] - Copied snippets
     * @param {string} [context.format] - Output format: bullets|slack|prose|custom
     * @returns {PromptResult}
     */
    build: (context) => {
      const { todayLog = [], yesterdayLog = [], copies = [], format = 'bullets' } = context;

      // Helper to format time
      const formatMs = (ms) => {
        const minutes = Math.round(ms / 60000);
        return minutes > 60 ? `${Math.round(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
      };

      // Format today's activity
      const todayActivity = todayLog.length > 0
        ? todayLog.map(e =>
            `- ${getDisplayName(e.domain)}: ${e.title} (${formatMs(e.activeTime || 0)} active)`
          ).join('\n')
        : 'No activity recorded today yet';

      // Format yesterday's activity
      const yesterdayActivity = yesterdayLog.length > 0
        ? yesterdayLog.map(e =>
            `- ${getDisplayName(e.domain)}: ${e.title} (${formatMs(e.activeTime || 0)} active)`
          ).join('\n')
        : 'No activity recorded yesterday';

      // Format copied snippets
      const copiesContext = copies.length > 0
        ? `\nCOPIED FROM PAGES:\n${copies.map(c => `- "${c.snippet}" (${getDisplayName(c.domain)})`).join('\n')}`
        : '';

      // Format templates
      const formatOutput = {
        bullets: `Format EXACTLY:
Yesterday:
• [item 1]
• [item 2]
Today:
• [item 1]
Blockers: None`,
        slack: `Format EXACTLY:
*Yesterday:* item1, item2
*Today:* item1
*Blockers:* None`,
        prose: `Write 3 short paragraphs:
Yesterday I worked on...
Today I plan to...
No blockers.`,
        custom: format // user's custom template
      };

      const system = `You are writing a developer's daily standup.
Use ONLY information from their actual work activity.
Never invent or guess work items.

YESTERDAY'S ACTIVITY:
${yesterdayActivity}

TODAY SO FAR:
${todayActivity}
${copiesContext}

${formatOutput[format] || formatOutput.bullets}

Rules:
- Use display names: "Jira" not "atlassian.net"
- Mention specific PR numbers, ticket IDs if visible in title
- Yesterday = previous working day (skip weekends)
- Keep each section to 2-4 items max
- If data is thin, say so honestly
- Never make up items`;

      return {
        system,
        user: 'Write my standup',
        maxTokens: 400
      };
    }
  },

  /**
   * Summarize what developer has open
   */
  summarizeTabs: {
    version: '1.0.0',
    description: 'Summarize what developer has open',
    // ...
  },

  /**
   * Day summary based on activity
   */
  summary: {
    version: '1.0.0',
    description: 'A summary of the day\'s work',

    /**
     * @param {Object} context
     * @param {Array} context.todayLog - Today's day log entries
     * @param {Object} context.todayStats - Today's statistics
     * @returns {PromptResult}
     */
    build: (context) => {
      const { todayLog = [], todayStats = {} } = context;

      const activity = formatLogEntries(todayLog);
      const stats = `Total Visits: ${todayStats.totalVisits || 0}
Unique Pages: ${todayStats.uniquePages || 0}
Active Time: ${Math.round((todayStats.totalActiveTime || 0) / 60000)} minutes`;

      const system = `You are a helpful assistant summarizing a developer's day.
Based on the browser activity logs, provide a high-level summary of what was achieved today.

Day activity:
${activity}

Day stats:
${stats}

Output format:
- Start with a clear 1-sentence headline summarizing the main focus of the day.
- Use 3-5 bullet points to group related activities.
- Highlight specific items like PRs, issues, or key documentation.
- Keep the tone professional but encouraging.`;

      return {
        system,
        maxTokens: 500
      };
    }
  },

  /**
   * Morning briefing from yesterday plus schedule
   */
  briefing: {
    version: '1.0.0',
    description: 'Morning briefing from yesterday plus schedule',

    /**
     * @param {Object} context
     * @param {Array} context.yesterdayLog - Yesterday's activity
     * @param {string} [context.todaySchedule] - Today's schedule
     * @param {Array} [context.patterns] - Work patterns
     * @returns {PromptResult}
     */
    build: (context) => {
      const { yesterdayLog = [], todaySchedule = null } = context;

      const yesterdayActivity = yesterdayLog.length > 0
        ? yesterdayLog.map(e => `- ${e.title} (${e.domain})`).join('\n')
        : 'No activity from yesterday';

      const system = `You are giving a morning briefing to start the developer's day.

Yesterday's activity:
${yesterdayActivity}

${todaySchedule ? `Today's schedule:\n${todaySchedule}` : 'No schedule available for today'}

Output format:
Yesterday recap (2-3 sentences)
${todaySchedule ? 'Today\'s schedule (list key items)' : ''}
Suggested focus: [one specific actionable item]

Rules:
• Warm but professional tone
• Keep total response under 150 words
• If no data available, be honest about it
• Focus on what matters most`;

      return {
        system,
        maxTokens: 400
      };
    }
  },

  /**
   * Briefing when reopening pages from yesterday
   */
  continueWork: {
    version: '1.0.0',
    description: 'Briefing when reopening pages from yesterday',

    /**
     * @param {Object} context
     * @param {ExtractedContent[]} context.pages - Pages being reopened
     * @param {Object} [context.lastSession] - Info about last session
     * @returns {PromptResult}
     */
    build: (context) => {
      const { pages = [], lastSession = {} } = context;

      const pagesList = pages.map((page, i) =>
        `${i + 1}. ${page.title}
   ${page.content.substring(0, 200)}...`
      ).join('\n\n');

      const system = `You are helping the developer resume work from where they left off.

Pages being reopened:
${pagesList}

${lastSession.time ? `Last session: ${lastSession.time}` : ''}

Output format:
Per page:
• Quick recap (1-2 sentences)
• Suggested next action

Overall: "Pick up with [X] first"

Rules:
• Be specific about where they left off
• Reference actual content from pages
• Actionable suggestions only
• Keep total under 200 words`;

      return {
        system,
        maxTokens: 500
      };
    }
  },

  /**
   * Insights about work patterns (future use)
   */
  patternInsight: {
    version: '1.0.0',
    description: 'Insights about work patterns',

    /**
     * @param {Object} context
     * @param {Object} context.patterns - Detected patterns
     * @param {Array} context.weekLog - Week's activity
     * @returns {PromptResult}
     */
    build: (context) => {
      const { patterns = {}, weekLog = [] } = context;

      const patternsText = Object.keys(patterns).length > 0
        ? JSON.stringify(patterns, null, 2)
        : 'No patterns detected yet';

      const system = `You are analyzing the developer's work patterns.

Detected patterns:
${patternsText}

Week's activity: ${weekLog.length} entries

Output format:
Peak hours: [time range]
Most used tools: [list top 3]
Observation: [one interesting insight]

Rules:
• Data driven, reference actual numbers
• No generic advice
• One specific actionable insight only
• Keep under 100 words`;

      return {
        system,
        maxTokens: 300
      };
    }
  },

  /**
   * Insights from today's activity log - simple but wow
   */
  dayInsight: {
    version: '3.0.0',
    description: 'Generate one-sentence insight from browsing activity',

    build: (context) => {
      const { dayLog = [], stats = {} } = context;

      // Group by domain and collect page titles
      const domainGroups = {};
      dayLog.forEach(entry => {
        const domain = entry.domain || 'unknown';
        if (!domainGroups[domain]) {
          domainGroups[domain] = { visits: 0, titles: [] };
        }
        domainGroups[domain].visits += (entry.visitCount || 1);

        // Collect interesting titles only
        if (entry.title &&
            !entry.title.includes('New Tab') &&
            !entry.title.includes('Google Search') &&
            entry.title.length > 5) {
          domainGroups[domain].titles.push(entry.title);
        }
      });

      // Top 6 domains with sample titles
      const activity = Object.entries(domainGroups)
        .sort((a, b) => b[1].visits - a[1].visits)
        .slice(0, 6)
        .map(([domain, data]) => {
          const name = getDisplayName(domain);
          const samples = data.titles.slice(0, 2).join(', ');
          return samples ? `${name}: ${samples}` : name;
        })
        .join('\n');

      const system = `Analyze this developer's browsing and write ONE sentence that captures what they're working on.

${activity}

BE SPECIFIC. Connect the dots. Make it feel like magic.

Good: "Building a Chrome extension with React - heavy Vite docs and Manifest V3 debugging"
Good: "Deep in LLM integration - bouncing between OpenAI docs, prompt engineering, and rate limit errors"
Bad: "Working on various development tasks across multiple tools"

Write ONLY one punchy sentence. No fluff.`;

      return {
        system,
        user: 'What am I working on?',
        maxTokens: 100
      };
    }
  },

  /**
   * Memory search - find something from work history
   */
  memorySearch: {
    version: '1.0.0',
    description: 'Find something from work history',
    build: ({ matches, question }) => ({
      system: `You are helping a developer find something from their work history.

They said: "${question}"

MATCHING ENTRIES FOUND
(scored by relevance, most relevant first):
${matches.length > 0
  ? matches.map(e => `
- ${e.title}
  URL: ${e.url}
  Date: ${new Date(Number(e.visitedAt)).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric',
    month: 'short', hour: '2-digit',
    minute: '2-digit'
  })}
  Active: ${Math.round((e.activeTime||0)/60000)}m
  Visits: ${e.visitCount || 1}
  ${e.copied?.length > 0 ? `Copied: "${e.copied[0]}"` : ''}
`).join('\n')
  : 'No matching entries found in work history.'}

Rules:
- Be specific about dates and times
- Always include the URL so they can go back
- If they copied from it, mention what they copied
- If nothing matches well, say so honestly and suggest what to search instead
- Keep under 150 words
- Offer to search differently if not found`,
      user: question,
      maxTokens: 300
    })
  },

  /**
   * Focus - what to work on next
   */
  focus: {
    version: '1.0.0',
    description: 'Suggest what to focus on next',
    build: ({ tabs, todayLog, copies }) => {
      const tabList = tabs.slice(0, 10).map(t => `- ${t.title}`).join('\n') || 'No tabs open';
      const recentWork = todayLog.slice(0, 10).map(e =>
        `- ${e.domain}: ${e.title} (${Math.round((e.activeTime||0)/60000)}m)`
      ).join('\n') || 'No activity today';
      const copiedItems = copies.slice(0, 5).map(e =>
        `- ${e.copied[0].substring(0, 100)}`
      ).join('\n') || 'Nothing copied';

      return {
        system: `You are helping a developer decide what to focus on next.

OPEN TABS:
${tabList}

TODAY'S WORK:
${recentWork}

RECENTLY COPIED:
${copiedItems}

Rules:
- Look for unfinished work (tabs left open)
- Identify blocked work (stuck on one thing too long)
- Suggest next logical step
- Be specific and actionable
- One clear recommendation
- Keep under 100 words`,
        user: 'What should I focus on next?',
        maxTokens: 200
      };
    }
  },

  /**
   * Meeting prep - prepare context for upcoming meeting
   */
  meetingPrep: {
    version: '1.0.0',
    description: 'Prep context for an upcoming meeting',
    build: ({ todayLog, yesterdayLog, tabs, question }) => ({
      system: `You are helping a developer prepare for a meeting.

They asked: "${question}"

TODAY'S WORK:
${todayLog.map(e =>
  `- ${e.domain}: ${e.title}
   Active: ${Math.round((e.activeTime||0)/60000)}m`
).join('\n') || 'No activity today'}

YESTERDAY:
${yesterdayLog.slice(0, 10).map(e =>
  `- ${e.domain}: ${e.title}`
).join('\n') || 'No data'}

OPEN TABS:
${tabs.map(t => `- ${t.title}`).join('\n') || 'No tabs'}

Rules:
- Find context relevant to the meeting topic
- Surface recent work on related items
- Mention any open PRs or tickets related
- Suggest 2-3 talking points
- Keep under 150 words`,
      user: question,
      maxTokens: 300
    })
  }
};

/**
 * Get a prompt by name and build it with context
 * @param {string} name - Prompt name (ask, standup, summary, etc)
 * @param {Object} context - Context for building the prompt
 * @returns {PromptResult}
 * @throws {Error} If prompt name not found
 *
 * @example
 * const prompt = getPrompt('standup', { todayLog, yesterdayLog });
 */
export function getPrompt(name, context = {}) {
  const prompt = PromptRegistry[name];

  if (!prompt) {
    const available = Object.keys(PromptRegistry).join(', ');
    const closestMatch = findClosestMatch(name, Object.keys(PromptRegistry));
    throw new Error(
      `Unknown prompt: "${name}". ` +
      `Available prompts: ${available}.` +
      (closestMatch ? ` Did you mean "${closestMatch}"?` : '')
    );
  }

  // Validate context (warnings only, never throws)
  validateContext(name, context);

  // Build and return the prompt
  return prompt.build(context);
}

/**
 * Find closest matching string (simple Levenshtein-like)
 * @private
 */
function findClosestMatch(input, options) {
  let closest = null;
  let minDistance = Infinity;

  for (const option of options) {
    const distance = levenshteinDistance(input.toLowerCase(), option.toLowerCase());
    if (distance < minDistance && distance <= 3) {
      minDistance = distance;
      closest = option;
    }
  }

  return closest;
}

/**
 * Simple Levenshtein distance for typo detection
 * @private
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * List all available prompts
 * @returns {Array<{name: string, version: string, description: string}>}
 */
export function listPrompts() {
  return Object.entries(PromptRegistry).map(([name, prompt]) => ({
    name,
    version: prompt.version,
    description: prompt.description
  }));
}

/**
 * Validate context has expected fields (logs warnings, never throws)
 * @param {string} name - Prompt name
 * @param {Object} context - Context to validate
 */
export function validateContext(name, context) {
  // Define expected context fields for each prompt (using PROMPT_KEYS values)
  const expectedFields = {
    ask: ['tabs', 'tabCount', 'totalTabs', 'history', 'copies'],
    standup: ['todayLog', 'yesterdayLog', 'copies', 'format'],
    summary: ['todayLog', 'todayStats'],
    briefing: ['yesterdayLog'],
    continueWork: ['pages'],
    patternInsight: ['patterns', 'weekLog'],
    dayInsight: ['dayLog', 'stats'],
    focus: ['tabs', 'todayLog', 'copies'],
    memorySearch: ['matches', 'question'],
    meetingPrep: ['todayLog', 'yesterdayLog', 'tabs', 'question'],
    // summarizeTabs is deprecated/unused
    summarizeTabs: ['tabs']
  };

  const expected = expectedFields[name];
  if (!expected) return; // Unknown prompt, skip validation

  const missing = expected.filter(field => context[field] === undefined);

  if (missing.length > 0) {
    console.warn(`[PromptRegistry] Prompt '${name}' missing context fields: ${missing.join(', ')}`);
    console.warn('[PromptRegistry] The prompt will still work but may not have all expected data');
  }
}
