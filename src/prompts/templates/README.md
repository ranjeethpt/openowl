# Templates - Quick Action Buttons for OpenOwl

Templates are **user-facing quick actions** that appear as buttons in the Ask tab. They gather context from your browsing activity and invoke prompts from the registry.

## Architecture Overview

```
User clicks "✍️ Write standup" button in Ask tab
          ↓
Template's gather() function collects data (logs, tabs, etc.)
          ↓
Template has prompt: 'standup'
          ↓
background.js calls getPrompt('standup', gatherData)
          ↓
LLM receives built system prompt + user message
          ↓
Response displayed in Ask tab
```

## Template vs Prompt

**Not all prompts have templates!**

| Prompt | Has Template? | Why? |
|--------|---------------|------|
| `standup` | ✅ Yes | User-facing button: "✍️ Write standup" |
| `summary` | ✅ Yes | User-facing button: "📊 Day summary" |
| `focus` | ✅ Yes | User-facing button: "🎯 What to focus on?" |
| `memorySearch` | ✅ Yes | User-facing button: "🔍 Remind me of..." |
| `meetingPrep` | ✅ Yes | User-facing button: "📅 Prep for..." |
| `ask` | ❌ No | General query handler (no button needed) |
| `dayInsight` | ❌ No | Background process for Today tab |
| `briefing` | ❌ No | Future feature (not yet implemented) |
| `continueWork` | ❌ No | Future feature (not yet implemented) |
| `patternInsight` | ❌ No | Future feature (not yet implemented) |

## Template Types

### Type: `auto`
Runs immediately when clicked. No user input needed.

**Example: Daily Standup**
```javascript
standup: {
  label: '✍️ Write standup',
  type: 'auto',
  category: 'daily',
  triggers: ['standup', 'stand up', 'daily update'],
  gather: async () => {
    // Gather all needed data
    return { todayLog, yesterdayLog, copies, format };
  },
  prompt: 'standup'
}
```

### Type: `prompt`
Prefills input field, waits for user to complete.

**Example: Memory Search**
```javascript
remind: {
  label: '🔍 Remind me of...',
  type: 'prompt',
  prefill: 'Remind me of ',
  category: 'memory',
  triggers: ['remind me', 'i remember', "can't find"],
  gather: async (question) => {
    // User completes: "Remind me of that React article"
    return { matches: await searchMemory(question), question };
  },
  prompt: 'memorySearch'
}
```

## Template Structure

```javascript
export const TEMPLATES = {
  yourTemplate: {
    label: string,           // Button text (e.g., '✍️ Write standup')
    type: 'auto' | 'prompt', // auto = runs immediately, prompt = waits for user
    category: string,        // Group: 'daily', 'memory', 'focus'
    triggers: string[],      // Intent detection keywords
    prefill?: string,        // (prompt type only) Prefills input field
    gather: async (question?) => object, // Collects context data
    prompt: string           // Must match a key in PromptRegistry
  }
}
```

## Adding a New Template

### Step 1: Add prompt to `registry.js` first

```javascript
// src/prompts/registry.js
export const PromptRegistry = {
  yourPrompt: {
    version: '1.0.0',
    description: 'What your prompt does',
    build: (context) => ({
      system: `Your LLM instructions here`,
      maxTokens: 400
    })
  }
};
```

### Step 2: Add template to `templates.js`

```javascript
export const TEMPLATES = {
  // ... existing templates

  yourTemplate: {
    label: '🔍 Your Action',     // Button text with emoji
    type: 'auto',                // 'auto' = runs immediately, 'prompt' = waits for user input
    category: 'daily',           // Group: 'daily', 'memory', 'focus'
    triggers: ['keyword1', 'keyword2'],  // Intent detection keywords
    gather: async () => {
      // Collect context data
      const tabs = await getAllTabs();
      const todayLog = await getMeaningfulHistory(20);

      return { tabs, todayLog };
    },
    prompt: 'yourPrompt'  // Must match key in PromptRegistry!
  }
};
```

### Step 3: Test

1. Reload extension in Chrome
2. Open Ask tab in OpenOwl sidebar
3. Click your new template button
4. Verify response uses correct context

## Best Practices

### ✅ DO

- Reference prompts by name: `prompt: 'standup'`
- Ensure prompt exists in registry before adding template
- Keep `gather()` functions focused on collecting specific data
- Add clear trigger keywords for intent detection
- Filter out sensitive data in `gather()` (respect user preferences)
- Use meaningful emoji in labels for visual scanning
- Test with empty/minimal data (edge cases)

### ❌ DON'T

- Reference non-existent prompts (runtime error)
- Gather unnecessary data (slow, wastes tokens)
- Throw errors in `gather()` - return minimal data instead
- Duplicate data gathering logic (use shared helpers)
- Add templates for internal processes (use prompt directly)

## Helper Functions

Templates commonly use these helpers:

```javascript
// Get recent browsing history (filters out neverTrack domains)
async function getMeaningfulHistory(limit = 50)

// Get text snippets user copied
async function getCopiedSnippets()

// Get today's activity stats
async function getTodayStats()

// Get all open tabs
async function getAllTabs()
```

## Intent Detection

Templates define `triggers` for automatic detection when users type natural questions:

```javascript
standup: {
  triggers: ['standup', 'stand up', 'daily update', 'scrum update']
}
```

When a user asks "Generate my standup", OpenOwl:
1. Matches "standup" trigger
2. Runs `standup.gather()`
3. Calls LLM with `'standup'` prompt

See `src/utils/intentDetector.js` for matching algorithm.

## Categories

Templates are grouped by category in the UI:

- **`daily`**: Daily workflows (standup, summary)
- **`memory`**: Search and recall (remind)
- **`focus`**: Productivity helpers (focus, meeting prep)
- **`dev`**: Developer tools (future: code review, debugging)

## Debugging

### Check if template is detected:

```javascript
// In browser console (service worker)
const { detectTemplate } = await import('./utils/intentDetector.js');
const template = detectTemplate('generate my standup');
console.log(template); // Should return 'standup'
```

### Test gather() function:

```javascript
// In browser console (service worker)
const { TEMPLATES } = await import('./prompts/templates.js');
const data = await TEMPLATES.standup.gather();
console.log(data); // Check gathered context
```

### Verify prompt reference:

```javascript
// In browser console (service worker)
import { getPrompt } from './prompts/registry.js';

// This should NOT throw an error:
const prompt = getPrompt('standup', { todayLog: [], yesterdayLog: [] });
console.log(prompt);
```

## Common Issues

### Template not appearing in UI

- Check `label` is set
- Verify template is exported in `TEMPLATES` object
- Reload extension after changes

### "Unknown prompt" error

```
Error: Unknown prompt: "standup". Available prompts: ask, summary, ...
```

**Fix**: Ensure prompt exists in registry.js with exact same name:
```javascript
// registry.js
export const PromptRegistry = {
  standup: { ... }  // Must match template's prompt: 'standup'
};
```

### gather() returns empty data

- Check async functions are awaited
- Verify storage has data (see [CONTRIBUTING.md](../../../CONTRIBUTING.md#debugging))
- Check user preferences aren't filtering everything out

### Intent detection not working

- Add more trigger keywords
- Test with exact trigger phrase
- Check `intentDetector.js` matching logic

## Examples

### Auto Template (Runs Immediately)

```javascript
summary: {
  label: '📊 Day summary',
  type: 'auto',
  category: 'daily',
  triggers: ['day summary', 'what did i do', 'recap today'],
  gather: async () => ({
    todayLog: await getMeaningfulHistory(50),
    todayStats: await getTodayStats()
  }),
  prompt: 'summary'
}
```

User clicks "📊 Day summary" → runs immediately → shows summary.

### Prompt Template (Waits for User Input)

```javascript
meetingPrep: {
  label: '📅 Prep for...',
  type: 'prompt',
  prefill: 'Prep me for ',
  category: 'focus',
  triggers: ['prep me for', 'meeting prep', 'about to have'],
  gather: async (question) => ({
    todayLog: await getMeaningfulHistory(30),
    yesterdayLog: await storage.getYesterdayLog(),
    tabs: await getAllTabs(),
    question  // "Prep me for standup with Alice"
  }),
  prompt: 'meetingPrep'
}
```

User clicks "📅 Prep for..." → input prefills "Prep me for " → user types "standup with Alice" → submits → LLM responds.

## Related Documentation

- [Prompt Registry](../README.md) - System prompts for LLM
- [CONTRIBUTING.md](../../../CONTRIBUTING.md) - Development guide
