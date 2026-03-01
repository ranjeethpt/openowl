/**
 * PROMPT REGISTRY
 *
 * All LLM system prompts for OpenOwl live here.
 * This is the single source of truth.
 *
 * To add a new prompt:
 * 1. Add entry to PromptRegistry object
 * 2. Define version, description, build()
 * 3. build() receives context, returns { system, user?, maxTokens }
 * 4. Use getPrompt('yourname', context) anywhere in codebase
 *
 * To edit a prompt:
 * 1. Find it by name below
 * 2. Edit the template string
 * 3. Bump version number
 * 4. Submit PR with before/after examples
 */

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
    version: '1.0.0',
    description: 'General questions about open tabs and work',

    /**
     * @param {Object} context
     * @param {ExtractedContent[]} context.tabs - Open tabs
     * @param {number} context.tabCount - Tabs being used
     * @param {number} context.totalTabs - Total tabs open
     * @param {Array} [context.dayLog] - Today's activity log
     * @returns {PromptResult}
     */
    build: (context) => {
      const { tabs = [], tabCount = 0, totalTabs = 0 } = context;

      const tabsContext = tabs.map((tab, i) =>
        `[${tab.active ? 'ACTIVE TAB' : `Tab ${i + 1}`}] ${tab.title}
URL: ${tab.url}
Content:
${tab.content}
${tab.compressed ? '(content compressed)' : ''}`
      ).join('\n\n---\n\n');

      const system = `You are OpenOwl, an AI assistant built into the developer's browser.

You have access to their open browser tabs to provide context-aware assistance.

Open tabs (${tabCount} of ${totalTabs}):

${tabsContext}

Rules:
• Be concise and specific
• Reference actual tab content when answering
• If something isn't in the context, say so honestly
• You are talking to a developer
• Never make up information not in the context`;

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
    version: '1.0.0',
    description: 'Generate daily standup from activity',

    /**
     * @param {Object} context
     * @param {Array} context.todayLog - Today's activity
     * @param {Array} [context.yesterdayLog] - Yesterday's activity
     * @param {Array} [context.patterns] - Work patterns
     * @returns {PromptResult}
     */
    build: (context) => {
      const { todayLog = [], yesterdayLog = [] } = context;

      const formatLog = (log) => log.map(entry =>
        `- ${entry.title} (${entry.domain}) at ${new Date(entry.timestamp).toLocaleTimeString()}`
      ).join('\n');

      const todayActivity = todayLog.length > 0
        ? formatLog(todayLog)
        : 'No activity logged today yet';

      const yesterdayActivity = yesterdayLog.length > 0
        ? formatLog(yesterdayLog)
        : 'No activity from yesterday';

      const system = `You are helping write a daily standup update.

Today's activity:
${todayActivity}

Yesterday's activity:
${yesterdayActivity}

STRICT output format:
Yesterday: [1-3 bullet points]
Today: [1-3 bullet points]
Blockers: [items or "None"]

Rules:
• Be specific, mention actual items from the log
• 1-3 bullets per section maximum
• Past tense for yesterday
• Future tense for today plans
• No filler words
• If todayLog is empty, say so honestly`;

      return {
        system,
        maxTokens: 300
      };
    }
  },

  /**
   * Summarize what developer has open
   */
  summarizeTabs: {
    version: '1.0.0',
    description: 'Summarize what developer has open',

    /**
     * @param {Object} context
     * @param {ExtractedContent[]} context.tabs - All open tabs
     * @returns {PromptResult}
     */
    build: (context) => {
      const { tabs = [] } = context;

      const tabsList = tabs.map((tab, i) =>
        `${i + 1}. ${tab.title}
   ${tab.content.substring(0, 200)}${tab.content.length > 200 ? '...' : ''}`
      ).join('\n\n');

      const system = `You are summarizing what the developer currently has open.

All tabs:
${tabsList}

Output format:
Group tabs by theme (Coding / Research / Communication / Other):
• Theme Name: 1-2 sentence summary
• Only group if 2+ tabs in that theme

End with:
Main focus: [specific description]

Rules:
• Be specific about what they're working on
• Mention PR numbers, issue names, etc if visible
• Keep summary under 150 words total`;

      return {
        system,
        maxTokens: 400
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
  }
};

/**
 * Get a prompt by name and build it with context
 * @param {string} name - Prompt name (ask, standup, etc)
 * @param {Object} context - Context for building the prompt
 * @returns {PromptResult}
 * @throws {Error} If prompt name not found
 */
export function getPrompt(name, context = {}) {
  const prompt = PromptRegistry[name];

  if (!prompt) {
    const available = Object.keys(PromptRegistry).join(', ');
    throw new Error(`Unknown prompt: ${name}. Available: ${available}`);
  }

  // Validate context (warnings only, never throws)
  validateContext(name, context);

  // Build and return the prompt
  return prompt.build(context);
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
  // Define expected context fields for each prompt
  const expectedFields = {
    ask: ['tabs', 'tabCount', 'totalTabs'],
    standup: ['todayLog'],
    summarizeTabs: ['tabs'],
    briefing: ['yesterdayLog'],
    continueWork: ['pages'],
    patternInsight: ['patterns', 'weekLog']
  };

  const expected = expectedFields[name];
  if (!expected) return; // Unknown prompt, skip validation

  const missing = expected.filter(field => context[field] === undefined);

  if (missing.length > 0) {
    console.warn(`[PromptRegistry] Prompt '${name}' missing context fields: ${missing.join(', ')}`);
    console.warn('[PromptRegistry] The prompt will still work but may not have all expected data');
  }
}
