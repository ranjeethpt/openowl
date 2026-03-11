# Contributing to OpenOwl

Thank you for your interest in contributing to OpenOwl! This document provides guidelines for contributing to the project.

## Table of Contents

- [Adding a New Site Extractor](#adding-a-new-site-extractor)
- [Adding a New Template](#adding-a-new-template)
- [Adding a New Prompt](#adding-a-new-prompt)
- [Debugging](#debugging)
- [Manual Testing Checklist](#manual-testing-checklist)
- [Other Contributions](#other-contributions)

---

## Adding a New Site Extractor

OpenOwl uses a **Strategy Pattern + Registry** architecture for site-specific content extraction. This makes it easy to add support for new websites.

### Step-by-Step Guide

1. **Create a new extractor file** in `src/content/extractors/sites/yoursite.js`

2. **Extend BaseSiteExtractor** and implement the required methods:

```javascript
import { BaseSiteExtractor } from '../base.js';

export class YourSiteExtractor extends BaseSiteExtractor {
  get domains() {
    return ['yoursite.com'];  // List of domains this extractor handles
  }

  get name() {
    return 'YourSite';  // Short display name — used in Today tab and standup output
  }

  extract() {
    try {
      // Extract content from the page
      const title = this.getText('h1', 300);
      const content = this.getText('.main-content', 800);

      return this.buildResult('yoursite_page', `${title}\n\n${content}`, {
        title
      });
    } catch (error) {
      console.error('YourSite extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }
}
```

3. **Register your extractor** in `src/content/extractors/registry.js`:

```javascript
// Add import
import { YourSiteExtractor } from './sites/yoursite.js';

// Add to EXTRACTORS array
const EXTRACTORS = [
  new GitHubExtractor(),
  new YourSiteExtractor(),  // <-- Add here
  // ... other extractors
];
```

4. **Test your extractor**:
   - Open a page from your target site
   - Open Chrome DevTools Console
   - Type: `chrome.runtime.sendMessage({type: 'READ_PAGE'}, console.log)`
   - Verify the extracted content looks correct

5. **Submit a pull request** with:
   - Your extractor file
   - Updated registry.js
   - A description of what sites/pages it handles
   - Example URLs where it works

### Helper Methods Available

The `BaseSiteExtractor` provides these helper methods:

- **`getText(selector, maxLength)`** - Get text from first matching element
- **`getMultiple(selector, maxLength)`** - Get text from all matching elements
- **`cleanText(text)`** - Clean and normalize text
- **`buildResult(type, content, metadata)`** - Build standardized result
- **`buildFallbackResult(reason)`** - Build error fallback

### Best Practices

1. **Never throw errors** - Always return a result, even if minimal
2. **Limit content length** - Max 2000 chars total (enforced by `buildResult`)
3. **Use semantic selectors** - Prefer stable selectors over fragile ones
4. **Handle multiple states** - Check URL paths for different page types
5. **Test edge cases** - Empty pages, loading states, errors

### Example: GitHub Extractor

See `src/content/extractors/sites/github.js` for a complete reference implementation that handles:
- Pull requests
- Issues
- Code files
- Repository pages

---

## Adding a New Template

**Templates** are UI buttons in the Ask tab that trigger common workflows.

### Two Ways to Add Templates

**Option 1: Visual Builder (No Code)** ⭐ Recommended for most use cases
- Use Settings → 📋 Custom Templates
- Perfect for domain-specific queries, time-based reports
- No coding required!

**Option 2: Built-in Template (Code)** - For specialized prompts
- Requires custom LLM prompt
- Best for complex logic or new categories
- See guide below

### When to Add a Built-in Template vs Custom Template

| Use Case | Template Type | Why |
|----------|--------------|-----|
| "Show me GitHub activity this week" | Custom | Simple filter, generic prompt |
| "JIRA tickets I worked on" | Custom | Domain + time filter |
| "Research summary from Stack Overflow" | Custom | Domain + time + instructions |
| "Write standup with special format" | Built-in | Needs specialized prompt |
| "Pattern analysis across repos" | Built-in | Complex logic, multi-step |

### Adding a Built-in Template

**Important:** All templates now use the unified `buildCustomGatherer()` function! This keeps code DRY and consistent.

1. **Add prompt to `src/prompts/registry.js` first**:

```javascript
export const PromptRegistry = {
  yourPrompt: {
    version: '1.0.0',
    description: 'What your prompt does',
    build: (context) => {
      const { entries, tabs, config } = context;

      // Build specialized prompt using context
      return {
        system: `Your custom LLM instructions here using ${entries.length} entries`,
        maxTokens: 400
      };
    }
  }
};
```

2. **Add template to `src/prompts/templates.js` using `buildCustomGatherer()`**:

```javascript
import { buildCustomGatherer } from '../utils/customTemplateRunner.js';

export const TEMPLATES = {
  // ... existing templates

  yourTemplate: {
    label: '🔍 Your Action',     // Button text with emoji
    type: 'auto',                // 'auto' = runs immediately, 'prompt' = waits for user input
    category: 'daily',           // Group: 'daily', 'memory', 'focus'
    triggers: ['keyword1', 'keyword2'],  // Intent detection keywords

    // ⭐ Use unified gatherer for consistency
    gather: async () => {
      const result = await buildCustomGatherer({
        timeRange: { type: 'today' },  // or 'yesterday', 'this_week', { type: 'last_n_days', n: 7 }
        domains: [],                    // e.g., ['github.com', 'stackoverflow.com']
        source: 'both',                 // 'both', 'live', or 'history'
        includeTabs: false,             // true to include open tabs
        minActiveMinutes: 0,            // minimum active time filter
        minVisitCount: 1                // minimum visit count filter
      });

      // Optional: transform data for your specialized prompt
      const processedData = result.entries.slice(0, 20);

      return {
        entries: processedData,
        tabs: result.tabs,
        // Add any custom fields your prompt needs
        customField: 'value'
      };
    },
    prompt: 'yourPrompt'  // Must match key in PromptRegistry!
  }
};
```

3. **Update `validateContext` in registry.js**:

```javascript
const expectedFields = {
  // ... other prompts
  yourPrompt: ['entries', 'tabs', 'customField']
};
```

4. **Test**:
   - Run `npm run build`
   - Reload extension
   - Open Ask tab
   - Click your button
   - Verify response

### Unified Architecture Benefits

All templates (built-in and custom) now use `buildCustomGatherer()`:

✅ **DRY**: Single implementation for data gathering
✅ **Consistent**: Same filters across all templates
✅ **Maintainable**: Bug fixes benefit all templates
✅ **Future-proof**: New time ranges work everywhere

**Example: Standup template uses unified gatherer**
```javascript
gather: async () => {
  const result = await buildCustomGatherer({
    timeRange: { type: 'today' },
    domains: [],
    source: 'both',
    includeTabs: false,
    minActiveMinutes: 0,
    minVisitCount: 1
  });

  // Extract copies from entries
  const copies = result.entries
    .filter(e => e.copied?.length > 0)
    .slice(0, 10);

  return {
    todayLog: result.entries,
    lastActivityLog: await storage.getLastActivityLog(),
    copies,
    format: 'bullets',
    lastDayLabel: 'Yesterday',
    isFirstRun: false
  };
}
```

### Template Types

- **`type: 'auto'`** - Runs immediately when clicked (e.g., "✍️ Write standup")
- **`type: 'prompt'`** - Prefills input field, waits for user to complete (e.g., "🔍 Remind me of...")

---

## Adding a New Prompt

**Prompts** are LLM system instructions. Not all prompts need templates! See the complete guide at [src/prompts/README.md](src/prompts/README.md).

### Quick Start

1. **Add prompt to `src/prompts/registry.js`**:

```javascript
export const PromptRegistry = {
  // ... existing prompts

  yourPrompt: {
    version: '1.0.0',
    description: 'Brief description of what this prompt does',
    build: (context) => {
      const { requiredField, optionalField = 'default' } = context;

      return {
        system: `You are a helpful assistant. ${requiredField}. ${optionalField}.`,
        user: 'Optional: prefill user message',  // Usually omitted
        maxTokens: 400  // Suggested token limit
      };
    }
  }
};
```

2. **(Optional) Add template** if this should be a user-facing button (see previous section)

3. **Test**:
   - Run `npm run build`
   - Check for errors
   - Test in Ask tab

### Prompts vs Templates

Not all prompts need templates!

| Scenario | Needs Template? | Example |
|----------|----------------|---------|
| User-facing button in Ask tab | ✅ Yes | "✍️ Write standup" |
| Background process | ❌ No | Today tab insights |
| General query handler | ❌ No | `ask` prompt |
| Future feature | ❌ No | Not yet in UI |

---

## Debugging

All debugging is done from the **extension service worker console**, not from a regular page DevTools.

**How to open it:**
```
chrome://extensions → find OpenOwl → click "service worker" link
```

Type `allow pasting` and press Enter before pasting any commands.

---

### Dump All Stored Data

Inspect everything OpenOwl has saved — IndexedDB day logs and all chrome.storage.local data:

```javascript
const db = await new Promise(r => {
  const req = indexedDB.open('openowl-db')
  req.onsuccess = e => r(e.target.result)
})
const tx = db.transaction('dayLogs', 'readonly')
const logs = await new Promise(r => {
  const req = tx.objectStore('dayLogs').getAll()
  req.onsuccess = e => r(e.target.result)
})

const local = await chrome.storage.local.get(null)

console.group('🦉 OpenOwl Data Dump')
console.group(`📅 IndexedDB — dayLogs (${logs.length} entries)`)
console.table(logs)
console.groupEnd()
console.group('⚙️ chrome.storage.local')
console.log(local)
console.groupEnd()
console.groupEnd()
```

---

### Clear All Data (Fresh Start)

Wipe everything — useful when testing first-install flows or resetting state:

```javascript
const db = await new Promise(r => {
  const req = indexedDB.open('openowl-db')
  req.onsuccess = e => r(e.target.result)
})
const tx = db.transaction('dayLogs', 'readwrite')
tx.objectStore('dayLogs').clear()
await chrome.storage.local.clear()
console.log('🗑️ All OpenOwl data cleared')
```

> **Note:** After clearing, reload the extension from `chrome://extensions` to reinitialise defaults.

---
### Inspect Live Entries With Extracted Content
Step through every live entry and see exactly what OpenOwl captured — URL, title, page content, copied snippets, and active time. Useful for verifying extractors are working correctly:

```javascript
const db = await new Promise(r => {
   const req = indexedDB.open('openowl-db')
   req.onsuccess = e => r(e.target.result)
})
const all = await new Promise(r => {
   const req = db.transaction('dayLogs', 'readonly').objectStore('dayLogs').getAll()
   req.onsuccess = e => r(e.target.result)
})
const live = all
        .filter(e => e.source !== 'history_import')
        .sort((a, b) => b.visitedAt - a.visitedAt)
live.forEach(e => {
   console.group(`${new Date(e.visitedAt).toLocaleTimeString()} — ${e.domain}`)
   console.log('URL:', e.url)
   console.log('Title:', e.title)
   console.log('Content:', e.content || '(none)')
   console.log('Copied:', e.copied?.length ? e.copied : '(none)')
   console.log('Active:', Math.round((e.activeTime || 0) / 1000) + 's')
   console.groupEnd()
})
```

---
### Live Entries Table View

Quick scannable table of all live entries — good for spotting missing content, zero active times, or domains that should not be tracked:


```javascript
const db = await new Promise(r => {
   const req = indexedDB.open('openowl-db')
   req.onsuccess = e => r(e.target.result)
})
const all = await new Promise(r => {
   const req = db.transaction('dayLogs', 'readonly').objectStore('dayLogs').getAll()
   req.onsuccess = e => r(e.target.result)
})
console.table(
        all
                .filter(e => e.source !== 'history_import')
                .sort((a, b) => b.visitedAt - a.visitedAt)
                .map(e => ({
                   time: new Date(e.visitedAt).toLocaleTimeString(),
                   domain: e.domain,
                   title: e.title?.slice(0, 50),
                   content: e.content ? e.content.slice(0, 80) + '...' : '(none)',
                   activeTime: Math.round((e.activeTime || 0) / 1000) + 's',
                   copied: e.copied?.length || 0
                }))
)
```

---
### Inspect Extracted Content For A Specific Domain
Check what OpenOwl captured from a single site — useful when building or debugging a site extractor:
```javascript
// 
const domain = 'github.com' // change this
const db = await new Promise(r => {
   const req = indexedDB.open('openowl-db')
   req.onsuccess = e => r(e.target.result)
})
const all = await new Promise(r => {
   const req = db.transaction('dayLogs', 'readonly').objectStore('dayLogs').getAll()
   req.onsuccess = e => r(e.target.result)
})
all
        .filter(e => e.source !== 'history_import' && e.domain === domain)
        .forEach(e => {
           console.log('---')
           console.log('URL:', e.url)
           console.log('Content:', e.content)
           console.log('Copied:', e.copied)
        })
```

---
### Count Entries By Date

Quickly see how many log entries exist per day — useful for verifying history import or day logging:

```javascript
const db = await new Promise(r => {
  const req = indexedDB.open('openowl-db')
  req.onsuccess = e => r(e.target.result)
})
const tx = db.transaction('dayLogs', 'readonly')
const logs = await new Promise(r => {
  const req = tx.objectStore('dayLogs').getAll()
  req.onsuccess = e => r(e.target.result)
})
const byDate = logs.reduce((acc, e) => {
   acc[e.date] = (acc[e.date] || 0) + 1
   return acc
}, {})

const sorted = Object.fromEntries(
        Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]))
)
console.table(sorted)
```

---

### View Custom Templates

See all user-created custom templates:

```javascript
const result = await chrome.storage.local.get('customTemplates')
console.table(result.customTemplates)
```

---

### Test buildCustomGatherer

Test the unified gatherer function with custom filters:

```javascript
// Import storage functions
const { getEntriesForRange } = await import('./storage/index.js')

// Test today's entries
const today = await getEntriesForRange({ type: 'today' })
console.log('Today entries:', today.length)
console.table(today.slice(0, 5))

// Test last 7 days with domain filter
const { buildCustomGatherer } = await import('./utils/customTemplateRunner.js')
const result = await buildCustomGatherer({
  timeRange: { type: 'last_n_days', n: 7 },
  domains: ['github.com'],
  source: 'both',
  includeTabs: false,
  minActiveMinutes: 5,
  minVisitCount: 1
})

console.log('Filtered result:', result.isEmpty ? 'EMPTY' : `${result.entries.length} entries`)
if (result.isEmpty) {
  console.log('Reason:', result.emptyReason)
  console.log('Message:', result.emptyMessage)
} else {
  console.table(result.entries)
}
```

---

### Manual Testing Checklist

Before submitting a PR, verify the following manually:

**New site extractor:**
- [ ] Open the site in Chrome with OpenOwl active
- [ ] Ask "what is this page about?" in the Ask tab
- [ ] Response references actual page content (not generic)
- [ ] Check console for `[Registry]` logs showing correct extractor used
- [ ] Test at least 3 different page types on that site
- [ ] No console errors thrown by the extractor

**New template:**
- [ ] Template button appears in Ask tab
- [ ] Clicking button triggers correct action (auto runs immediately, prompt prefills)
- [ ] Response is relevant and uses gathered context
- [ ] Intent detection works for at least 2 trigger phrases
- [ ] No console errors during execution
- [ ] Check console for `[ASK_AI] Template matched: yourTemplate` log

**New prompt:**
- [ ] Build succeeds: `npm run build`
- [ ] No "Unknown prompt" errors in console
- [ ] LLM response follows system instructions
- [ ] Test with at least one LLM provider (Claude, OpenAI, or Gemini)

**New feature or bug fix:**
- [ ] No console errors
- [ ] Works with at least one LLM provider (Claude or Ollama)
- [ ] Tab count shows correctly in Ask tab
- [ ] Today tab still loads correctly
- [ ] Settings save and persist after reload

---

## Other Contributions

We welcome:
- Bug fixes
- Documentation improvements
- UI/UX enhancements
- Performance optimizations
- New features (please open an issue first to discuss)

## Development Setup

See [SETUP.md](./SETUP.md) for detailed development setup instructions.

## Questions?

Open an issue or start a discussion on GitHub!