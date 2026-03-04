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

**Templates** are UI buttons in the Ask tab that trigger common workflows. See the complete guide at [src/prompts/templates/README.md](src/prompts/templates/README.md).

### Quick Start

1. **Add prompt to `src/prompts/registry.js` first**:

```javascript
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

2. **Add template to `src/prompts/templates.js`**:

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

3. **Test**:
   - Reload extension
   - Open Ask tab
   - Click your button
   - Verify response

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
console.table(byDate)
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