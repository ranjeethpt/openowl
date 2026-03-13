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
import { DEFAULT_MAX_TOKENS } from '../constants.js';

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
        version: '2.2.0',
        description: 'General questions with full context (tabs + history + copies)',
        active: true, // Used by Ask tab general questions

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
                ? history.map(e => {
                    const copiedText = e.copied?.length > 0
                        ? (typeof e.copied[0] === 'string' ? e.copied[0] : e.copied[0]?.text || '')
                        : '';
                    return `- ${e.domain}: ${e.title}
      URL: ${e.url}
      Time: ${Math.round((e.activeTime || 0) / 60000)}m active
      Visits: ${e.visitCount || 1}
      ${e.source === 'history_import' ? '(from browser history)' : ''}
      ${copiedText ? `Copied: "${copiedText}"` : ''}`;
                }).join('\n')
                : '';

            const copiesContext = copies.length > 0
                ? copies.map(c => `- "${c.text}" (${c.domain})`).join('\n')
                : '';

            const system = `You are OpenOwl, AI assistant
built into the IT professional's Chrome browser.
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
- You are talking to an IT professional`;

            return {
                system,
                maxTokens: DEFAULT_MAX_TOKENS.ask
            };
        }
    },

    /**
     * Generate daily standup from activity
     */
    standup: {
        version: '3.0.0',
        description: 'Generate daily standup grouped by Delivery, Strategy, and Enablement — for any IT role',
        active: true, // Used by "✍️ Write standup" template

        /**
         * @param {Object} context
         * @param {Array} context.todayLog - Today's day log entries with full metadata
         * @param {Array} [context.lastActivityLog] - Last activity day log entries
         * @param {Array} [context.copies] - Copied snippets
         * @param {string} [context.format] - Output format: bullets|slack|prose|custom
         * @param {string} [context.lastDayLabel] - Human label for last activity day
         * @param {boolean} [context.isFirstRun] - True if no activity recorded yet
         * @returns {PromptResult}
         */
        build: (context) => {
            const {
                todayLog = [],
                lastActivityLog = [],
                copies = [],
                format = 'bullets',
                lastDayLabel = 'Yesterday',
                isFirstRun = false
            } = context;

            // Handle first run case
            if (isFirstRun) {
                const system = `You are OpenOwl, helping an IT professional set up their standup workflow.

This is their first time using standup generation, and no activity has been recorded yet.

Don't try to write a standup from empty data. Instead:
- Explain that OpenOwl will track their browsing activity
- Once activity is recorded, standups will be generated automatically
- Suggest trying again tomorrow after some work
- Offer a blank template they can fill manually if needed

Keep it friendly and under 100 words.`;

                return {
                    system,
                    user: 'Write my standup',
                    maxTokens: DEFAULT_MAX_TOKENS.standup
                };
            }

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

            // Format last activity day
            let lastActivity = 'No activity recorded';
            let isHistoryImportOnly = false;

            if (lastActivityLog.length > 0) {
                // Check if all entries are from history_import
                isHistoryImportOnly = lastActivityLog.every(e => e.source === 'history_import');

                lastActivity = lastActivityLog.map(e => {
                    const timeInfo = e.source === 'history_import'
                        ? '(from browser history)'
                        : `(${formatMs(e.activeTime || 0)} active)`;
                    return `- ${getDisplayName(e.domain)}: ${e.title} ${timeInfo}`;
                }).join('\n');
            }

            // Format copied snippets
            const copiesContext = copies.length > 0
                ? `\nCOPIED FROM PAGES:\n${copies.map(c => `- "${c.text}" (${getDisplayName(c.domain)})`).join('\n')}`
                : '';

            // Format templates - use lastDayLabel instead of "Yesterday"
            const formatOutput = {
                bullets: `Format EXACTLY:
${lastDayLabel}:
• [item 1]
• [item 2]
Today:
• [item 1]
Blockers: None`,
                slack: `Format EXACTLY:
*${lastDayLabel}:* item1, item2
*Today:* item1
*Blockers:* None`,
                prose: `Write 3 short paragraphs:
${lastDayLabel} I worked on...
Today I plan to...
No blockers.`,
                custom: format // user's custom template
            };

            const system = `You are writing a professional daily standup for an IT professional (Developer, Engineering Manager, BA, or Tech Lead).
Use ONLY the provided activity data. Never invent or guess work items.

STANDUP RULES:

1. CATEGORIZE items into exactly these groups:
   - "Delivery & Execution" — active tasks, tickets, PRs, deployments, investigations
   - "Strategy & Discovery" — roadmaps, requirements, planning, analysis, discovery tickets
   - "Enablement & Governance" — ALL meetings regardless of length, 1:1s, standups,
     AI chat sessions (Gemini/ChatGPT), Slack/Teams conversations, documentation, research

2. MEETINGS: Always include every meeting entry, even 0–1m ones.
   Use the meeting title as the item. If title is generic (e.g. "Google Meet"),
   infer context from surrounding Jira/GitHub activity at the same time.

3. AI CHATS: Gemini/ChatGPT sessions = active problem-solving.
   Note the session duration. Infer the likely topic from adjacent tickets or
   GitHub entries in the timeline. Format as:
   "AI-assisted problem solving — [inferred topic if possible] ([Xm])"

4. CHATS & COMMS: Slack/Teams entries — include channel or person name if visible.

5. DETAIL: Always include Ticket ID AND descriptive title — never a bare key alone.
   ✅ KEY-1234 — Title of the ticket
   ❌ KEY-1234

6. CONTEXT: Add a brief inferred action after each item.
   e.g. "Reviewed for delivery scope" / "Investigated for root cause" / "Updated status"

7. CONSOLIDATE: Keep each group to 2–4 bullets. Merge related items.
   e.g. multiple views of the same ticket = one bullet.

8. SKIP NOISE: Ignore search queries, social browsing, error pages,
   and 0m entries with no meaningful title or context.

9. Apply the same three-group structure to both ${lastDayLabel} and Today.
   Omit a group entirely if there are no entries for it.
${isHistoryImportOnly ? '\nNOTE: These entries are from browser history (no active time tracked). Infer what was worked on from page titles and URLs.' : ''}

${lastDayLabel.toUpperCase()}'S ACTIVITY:
${lastActivity}

TODAY SO FAR:
${todayActivity}
${copiesContext}

Format EXACTLY:

${lastDayLabel}:
### Delivery & Execution
• [Ticket ID] — [Descriptive title] — [action taken]

### Strategy & Discovery
• [Ticket ID / Topic] — [Descriptive title] — [planning or analysis action]

### Enablement & Governance
• [Meeting / Chat / Doc] — [outcome or inferred context]

Today:
### Delivery & Execution
• [Ticket ID] — [Descriptive title] — [current focus]

### Strategy & Discovery
• ...

### Enablement & Governance
• ...`;

            return {
                system,
                user: 'Write my standup',
                maxTokens: DEFAULT_MAX_TOKENS.standup
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
        version: '2.0.0',
        description: 'End-of-day summary grouped by Delivery, Strategy, and Enablement — for any IT role',
        active: true, // Used by "📊 Day summary" template

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

            const system = `You are summarizing a workday for an IT professional (Developer, Engineering Manager, BA, or Tech Lead).
Use ONLY the provided activity data. Never invent or guess work items.

DAY SUMMARY RULES:

1. HEADLINE: Start with one clear sentence capturing the main focus of the day.

2. CATEGORIZE into these groups (omit any group with no entries):
   - "Delivery & Execution" — tickets investigated, PRs reviewed, incidents handled
   - "Strategy & Discovery" — planning, roadmap, analysis, discovery work
   - "Enablement & Governance" — ALL meetings regardless of length, 1:1s, standups,
     AI chat sessions (Gemini/ChatGPT), research, documentation

3. MEETINGS: Always include, even 0–1m entries. Infer context from surrounding activity.

4. AI CHATS: Treat as active problem-solving. Infer topic from adjacent tickets/GitHub.
   Format as: "AI-assisted problem solving — [inferred topic] ([Xm])"

5. DETAIL: Always include Ticket ID AND descriptive title — never a bare key alone.

6. TONE: Professional but encouraging. Acknowledge complexity or volume if warranted.

7. SKIP NOISE: Search queries, social browsing, error pages, accidental 0m visits.

DAY ACTIVITY:
${activity}

DAY STATS:
${stats}

Format EXACTLY:

**[One-sentence headline summarising the day's main focus]**

### Delivery & Execution
• [Ticket ID] — [Descriptive title] — [what was done]

### Strategy & Discovery
• [Ticket ID / Topic] — [Descriptive title] — [planning or analysis action]

### Enablement & Governance
• [Meeting / Chat / Doc] — [outcome or inferred context]

---
📊 [Total visits] visits · [Unique pages] unique pages · [Active time] active`;

            return {
                system,
                maxTokens: DEFAULT_MAX_TOKENS.summary
            };
        }
    },

    /**
     * Morning briefing from yesterday plus schedule
     */
    briefing: {
        version: '1.1.0',
        description: 'Morning briefing from yesterday plus schedule',
        active: false, // Future feature - not yet implemented

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

            const system = `You are giving a morning briefing to start the IT professional's day.

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
                maxTokens: DEFAULT_MAX_TOKENS.briefing
            };
        }
    },

    /**
     * Briefing when reopening pages from yesterday
     */
    continueWork: {
        version: '1.1.0',
        description: 'Briefing when reopening pages from yesterday',
        active: false, // Future feature - not yet implemented

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

            const system = `You are helping the IT professional resume work from where they left off.

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
                maxTokens: DEFAULT_MAX_TOKENS.continueWork
            };
        }
    },

    /**
     * Insights about work patterns (future use)
     */
    patternInsight: {
        version: '1.1.0',
        description: 'Insights about work patterns',
        active: false, // Future feature - not yet implemented

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

            const system = `You are analyzing the IT professional's work patterns.

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
                maxTokens: DEFAULT_MAX_TOKENS.patternInsight
            };
        }
    },

    /**
     * Insights from today's activity log - simple but wow
     */
    dayInsight: {
        version: '3.1.0',
        description: 'Generate one-sentence insight from browsing activity',
        active: true, // Used by Activity tab for real-time insights

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

            const system = `Analyze this IT professional's browsing and write ONE sentence that captures what they're working on.

${activity}

BE SPECIFIC. Connect the dots. Make it feel like magic.

Good: "Deep in Spring Boot 4 migration — bouncing between Jira tickets, GitHub PRs, and Confluence docs"
Good: "Planning week focused on roadmap and partner initiatives — heavy Jira and meeting activity"
Good: "Incident investigation day — Jira service management, GitHub, and Datadog all in play"
Bad: "Working on various tasks across multiple tools"

Write ONLY one punchy sentence. No fluff.`;

            return {
                system,
                user: 'What am I working on?',
                maxTokens: DEFAULT_MAX_TOKENS.dayInsight
            };
        }
    },

    /**
     * Memory search - find something from work history
     */
    memorySearch: {
        version: '1.1.0',
        description: 'Find something from work history',
        active: true, // Used by "🔍 Remind me of" template
        build: ({ matches, question }) => ({
            system: `You are helping an IT professional find something from their work history.

They said: "${question}"

MATCHING ENTRIES FOUND
(scored by relevance, most relevant first):
${matches.length > 0
                ? matches.map(e => {
                    const copiedText = e.copied?.length > 0
                        ? (typeof e.copied[0] === 'string' ? e.copied[0] : e.copied[0]?.text || '')
                        : '';
                    return `
- ${e.title}
  URL: ${e.url}
  Date: ${new Date(Number(e.visitedAt)).toLocaleDateString('en-AU', {
                        weekday: 'short', day: 'numeric',
                        month: 'short', hour: '2-digit',
                        minute: '2-digit'
                    })}
  Active: ${Math.round((e.activeTime||0)/60000)}m
  Visits: ${e.visitCount || 1}
  ${copiedText ? `Copied: "${copiedText}"` : ''}
`;
                }).join('\n')
                : 'No matching entries found in work history.'}

Rules:
- Be specific about dates and times
- Always include the URL so they can go back
- If they copied from it, mention what they copied
- If nothing matches well, say so honestly and suggest what to search instead
- Keep under 150 words
- Offer to search differently if not found`,
            user: question,
            maxTokens: DEFAULT_MAX_TOKENS.memorySearch
        })
    },

    /**
     * Focus - what to work on next
     */
    focus: {
        version: '2.0.0',
        description: 'Suggest what to focus on next based on open tabs and todays work',
        active: true, // Used by "🎯 What to focus on" template
        build: ({ tabs, todayLog, copies }) => {
            const tabList = tabs.slice(0, 10).map(t => `- ${t.title}`).join('\n') || 'No tabs open';
            const recentWork = todayLog.slice(0, 10).map(e =>
                `- ${e.domain}: ${e.title} (${Math.round((e.activeTime||0)/60000)}m)`
            ).join('\n') || 'No activity today';
            const copiedItems = copies.slice(0, 5).map(e => {
                const copiedText = typeof e.copied[0] === 'string'
                    ? e.copied[0]
                    : e.copied[0]?.text || '';
                return `- ${copiedText.substring(0, 100)}`;
            }).join('\n') || 'Nothing copied';

            return {
                system: `You are helping an IT professional decide what to focus on next.
Use ONLY the provided tabs and activity data. Never invent or guess work items.

FOCUS RULES:

1. SCAN open tabs for signals:
   - Unfinished work (ticket left open = likely in-progress or blocked)
   - Active investigation threads (multiple related tabs = deep dive)
   - Pending comms (email, chat tabs open = needs response)
   - Long AI chat sessions = complex problem being solved

2. SCAN today's activity for signals:
   - What has the most time invested? (likely the priority)
   - What was started but not resolved? (incomplete investigation, 0m visit)
   - What's been revisited multiple times? (likely stuck or important)

3. CROSS-REFERENCE: Open tabs + today's work together reveal the clearest next action.

4. RECOMMEND: Give ONE specific, actionable next step.
   - Name the ticket/PR/meeting by ID AND descriptive title
   - Say exactly what action to take (e.g. "Close out", "Follow up", "Review and comment")
   - Give one sentence of reasoning grounded in the data

5. SECONDARY: Optionally call out one other item worth not losing track of today.

6. SKIP NOISE: Search queries, social tabs, error pages, generic "Google Meet" with no context.

7. Keep the entire response under 100 words. Be direct.

OPEN TABS:
${tabList}

TODAY'S WORK:
${recentWork}

RECENTLY COPIED:
${copiedItems}

Format EXACTLY:

**Focus now:** [Ticket ID] — [Descriptive title]
[One sentence: what to do and why, grounded in the data]

**Don't lose track of:** [Item] — [one-line reason]`,
                user: 'What should I focus on next?',
                maxTokens: DEFAULT_MAX_TOKENS.focus
            };
        }
    },

    /**
     * Meeting prep - prepare context for upcoming meeting
     */
    meetingPrep: {
        version: '1.1.0',
        description: 'Prep context for an upcoming meeting',
        active: true, // Used by "📅 Prep for" template
        build: ({ todayLog, yesterdayLog, tabs, question }) => ({
            system: `You are helping an IT professional prepare for a meeting.

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
            maxTokens: DEFAULT_MAX_TOKENS.meetingPrep
        })
    },

    /**
     * Custom template - user-defined data gathering and analysis
     */
    customTemplate: {
        version: '1.1.0',
        description: 'User-created custom template with configurable filters and instructions',
        active: true, // Used by user-created custom templates

        /**
         * @param {Object} context
         * @param {Array} context.entries - Filtered activity entries
         * @param {Array} context.tabs - Open tabs (if includeTabs is true)
         * @param {Object} context.config - Template configuration
         * @returns {PromptResult}
         */
        build: (context) => {
            const { entries = [], tabs = [], config = {} } = context;

            // Format time range description
            let periodDescription = '';
            if (config.filters?.timeRange) {
                const tr = config.filters.timeRange;
                switch (tr.type) {
                    case 'today':
                        periodDescription = 'Today';
                        break;
                    case 'yesterday':
                        periodDescription = 'Yesterday';
                        break;
                    case 'last_n_days':
                        periodDescription = `Last ${tr.n || 7} days`;
                        break;
                    case 'this_week':
                        periodDescription = 'This week (Monday to today)';
                        break;
                    case 'last_week':
                        periodDescription = 'Last week (Monday to Sunday)';
                        break;
                    default:
                        periodDescription = 'Selected period';
                }
            }

            // Format domain filter note
            const domainNote = config.filters?.domains?.length > 0
                ? `\nFiltered to domains: ${config.filters.domains.join(', ')}`
                : '';

            // Format entries
            const entriesText = entries.map(e => {
                const activeMinutes = Math.round((e.activeTime || 0) / 60000);
                const contentPreview = e.content
                    ? e.content.substring(0, 150).replace(/\n/g, ' ')
                    : '';
                let copiedNote = '';
                if (e.copied && e.copied.length > 0) {
                    const copiedText = typeof e.copied[0] === 'string'
                        ? e.copied[0]
                        : e.copied[0]?.text || '';
                    copiedNote = copiedText ? `\n   Copied: "${copiedText.substring(0, 100)}"` : '';
                }
                const sourceNote = e.source === 'history_import'
                    ? ' (from browser history - no content available)'
                    : '';

                return `- ${e.domain || 'unknown'}: ${e.title}
   Date: ${new Date(e.visitedAt).toLocaleString()}
   Active: ${activeMinutes}m | Visits: ${e.visitCount || 1}${sourceNote}
   ${contentPreview}${copiedNote}`;
            }).join('\n\n');

            // Default instructions if user didn't provide any
            const userInstructions = config.userInstructions && config.userInstructions.trim()
                ? config.userInstructions
                : 'Provide a general activity summary, grouped by domain or topic.';

            // Format output based on config
            let outputFormatInstruction = '';
            switch (config.outputFormat) {
                case 'prose':
                    outputFormatInstruction = 'Write in prose paragraphs, conversational tone.';
                    break;
                case 'slack':
                    outputFormatInstruction = 'Format for Slack: use *bold* for headings, keep it compact.';
                    break;
                case 'bullets':
                default:
                    outputFormatInstruction = 'Use bullet points, organized by topic or domain.';
            }

            const system = `You are OpenOwl, AI assistant built into the IT professional's Chrome browser.

DATA BLOCK: ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}
Period: ${periodDescription}${domainNote}

${entriesText}

${config.userInstructions && config.userInstructions.trim() ? `ADDITIONAL INSTRUCTIONS FROM USER:
${userInstructions}` : ''}

${outputFormatInstruction}

Rules:
- Only use the data provided above
- Never invent activity that wasn't recorded
- Note: Entries marked "from browser history" have no content - infer from title and URL
- If asked about something not in the data, say so honestly
- Keep response under 300 words`;

            return {
                system,
                maxTokens: DEFAULT_MAX_TOKENS.customTemplate
            };
        }
    },

    /**
     * Weekly summary - wrap up the week's work
     */
    weekSummary: {
        version: '2.0.0',
        description: 'Weekly summary grouped by Delivery, Strategy, and Enablement — for any IT role',
        active: true, // Used by "📅 Week wrap" template

        /**
         * @param {Object} context
         * @param {Array} context.weekLog - Week's day log entries
         * @param {boolean} context.hasActivity - Whether any activity exists this week
         * @param {boolean} context.isHistoryOnly - Whether only history_import data exists
         * @returns {PromptResult}
         */
        build: (context) => {
            const { weekLog = [], hasActivity = false, isHistoryOnly = false } = context;

            // Handle no activity case
            if (!hasActivity) {
                const today = new Date();
                const dayOfWeek = today.getDay();
                const isEarlyWeek = dayOfWeek === 1 || dayOfWeek === 2; // Monday or Tuesday

                const system = `You are OpenOwl, helping an IT professional with their weekly summary.

No activity has been recorded this week yet.

${isEarlyWeek
                    ? 'This is normal - it\'s early in the week (Monday/Tuesday).'
                    : 'It looks like there hasn\'t been much activity tracked this week.'
                }

Don't try to write a summary from empty data. Instead:
- Explain that activity will accumulate as the week progresses
- Suggest trying the daily standup instead for today's activity
- Keep it friendly and brief

Max 80 words.`;

                return {
                    system,
                    user: 'Write my week wrap',
                    maxTokens: DEFAULT_MAX_TOKENS.weekSummary
                };
            }

            // Helper to format time
            const formatMs = (ms) => {
                const minutes = Math.round(ms / 60000);
                return minutes > 60 ? `${Math.round(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
            };

            // Group entries by date
            const byDate = {};
            weekLog.forEach(entry => {
                if (!byDate[entry.date]) {
                    byDate[entry.date] = [];
                }
                byDate[entry.date].push(entry);
            });

            // Format activity grouped by day
            const activityByDay = Object.keys(byDate)
                .sort()
                .map(date => {
                    const dayEntries = byDate[date];
                    const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });

                    const formattedEntries = dayEntries.map(e => {
                        const timeInfo = e.source === 'history_import'
                            ? '(from browser history)'
                            : `(${formatMs(e.activeTime || 0)} active)`;
                        return `  - ${getDisplayName(e.domain)}: ${e.title} ${timeInfo}`;
                    }).join('\n');

                    return `${dayName} (${date}):\n${formattedEntries}`;
                })
                .join('\n\n');

            const system = `You are writing a professional weekly summary for an IT professional (Developer, Engineering Manager, BA, or Tech Lead).
Use ONLY the provided activity data. Never invent or guess work items.

WEEK WRAP RULES:

1. CATEGORIZE across the full week into:
   - "Delivery & Execution" — tasks completed or progressed: tickets, PRs, investigations, deployments
   - "Strategy & Discovery" — planning, roadmap review, analysis, discovery work
   - "Enablement & Governance" — meetings, 1:1s, standups, AI chat sessions, documentation, research

2. MEETINGS: Always capture meetings by name. Infer context from surrounding ticket/GitHub activity.

3. AI CHATS: Group all Gemini/ChatGPT sessions. Infer likely topics from adjacent work.
   Format as: "AI-assisted problem solving — [inferred topics] (total Xm across week)"

4. DETAIL: Always include Ticket ID AND descriptive title — never a bare key alone.
   ✅ KEY-1234 — Title of the ticket
   ❌ KEY-1234

5. PATTERNS: Identify what dominated the week. Call out recurring tickets or themes.

6. CONSOLIDATE: Keep each group to 3–5 bullets. Merge related items across days.

7. SKIP NOISE: Ignore search queries, social browsing, error pages,
   and 0m entries with no meaningful title or context.

8. NEXT WEEK: Suggest 2–3 focus areas based on open/in-progress items visible in the data.
   Never invent items — only suggest continuation of what's visible.
${isHistoryOnly ? '\nNOTE: These entries are from browser history (no active time tracked). Infer what was worked on from page titles and URLs.' : ''}

WEEK'S ACTIVITY (grouped by day):
${activityByDay}

Format EXACTLY:

### Delivery & Execution
• [Ticket ID] — [Descriptive title] — [what was done across the week]

### Strategy & Discovery
• [Ticket ID / Topic] — [Descriptive title] — [planning or analysis done]

### Enablement & Governance
• [Meeting / Chat / Doc] — [key outcome or context]

---
**Pattern this week:** [1–2 sentence summary of what dominated the week]

Next week:
• [Suggested focus 1 — grounded in open items from the data]
• [Suggested focus 2]`;

            return {
                system,
                user: 'Write my week wrap',
                maxTokens: DEFAULT_MAX_TOKENS.weekSummary
            };
        }
    }
};

/**
 * Get a prompt by name and build it with context
 * @param {string} name - Prompt name (ask, standup, summary, etc)
 * @param {Object} context - Context for building the prompt
 * @param {Object} [settings] - Optional settings with maxTokens overrides
 * @returns {PromptResult}
 * @throws {Error} If prompt name not found
 *
 * @example
 * const prompt = getPrompt('standup', { todayLog, yesterdayLog });
 * const prompt = getPrompt('standup', { todayLog, yesterdayLog }, settings);
 */
export function getPrompt(name, context = {}, settings = null) {
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

    // Build the prompt
    const builtPrompt = prompt.build(context);

    // Apply user's maxTokens override if available
    if (settings?.maxTokens?.[name]) {
        builtPrompt.maxTokens = settings.maxTokens[name];
    }

    return builtPrompt;
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
 * @returns {Array<{name: string, version: string, description: string, active: boolean}>}
 */
export function listPrompts() {
    return Object.entries(PromptRegistry).map(([name, prompt]) => ({
        name,
        version: prompt.version,
        description: prompt.description,
        active: prompt.active !== false // Default to true if not specified
    }));
}

/**
 * Get list of active prompt names (used in production)
 * @returns {Array<string>} Array of active prompt keys
 */
export function getActivePromptNames() {
    return Object.entries(PromptRegistry)
        .filter(([, prompt]) => prompt.active !== false)
        .map(([name]) => name);
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
        standup: ['todayLog', 'lastActivityLog', 'copies', 'format', 'lastDayLabel', 'isFirstRun'],
        summary: ['todayLog', 'todayStats'],
        briefing: ['yesterdayLog'],
        continueWork: ['pages'],
        patternInsight: ['patterns', 'weekLog'],
        dayInsight: ['dayLog', 'stats'],
        focus: ['tabs', 'todayLog', 'copies'],
        memorySearch: ['matches', 'question'],
        meetingPrep: ['todayLog', 'yesterdayLog', 'tabs', 'question'],
        weekSummary: ['weekLog', 'hasActivity', 'isHistoryOnly'],
        customTemplate: ['entries', 'tabs', 'config'],
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