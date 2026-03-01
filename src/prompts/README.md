# Prompt Registry

This directory contains the **single source of truth** for all LLM system prompts in OpenOwl.

## Philosophy

**No prompts should exist anywhere else in the codebase.**

All AI instructions are centralized here for:
- ✅ Easy editing and version control
- ✅ Consistent prompt quality
- ✅ Clear ownership and review process
- ✅ A/B testing capabilities
- ✅ Prompt versioning

## Structure

Each prompt in `registry.js` has:

```javascript
promptName: {
  version: '1.0.0',           // Semantic versioning
  description: 'What it does', // Human-readable description
  build: (context) => ({       // Builder function
    system: 'System prompt...',  // Required: System message
    user: 'Optional user msg',   // Optional: Pre-filled user message
    maxTokens: 500              // Suggested token limit
  })
}
```

## Available Prompts

| Name | Purpose | Context Required |
|------|---------|------------------|
| `ask` | General questions about tabs | tabs, tabCount, totalTabs |
| `standup` | Daily standup generation | todayLog, yesterdayLog? |
| `summarizeTabs` | Summarize open tabs | tabs |
| `briefing` | Morning briefing | yesterdayLog, todaySchedule? |
| `continueWork` | Resume work session | pages, lastSession? |
| `patternInsight` | Work pattern insights | patterns, weekLog |

## Usage

### In Code

```javascript
import { getPrompt } from '../prompts/registry.js';

// Get a built prompt
const { system, maxTokens } = getPrompt('ask', {
  tabs: [...],
  tabCount: 5,
  totalTabs: 12
});

// Use with LLM
await callLLM({
  systemPrompt: system,
  prompt: userQuestion,
  // ...
});
```

### With callWithPrompt Helper

```javascript
import { callWithPrompt } from '../llm/index.js';

const result = await callWithPrompt(
  'standup',                    // Prompt name
  { todayLog, yesterdayLog },   // Context
  'Generate my standup',        // User message
  { provider, apiKey, model }   // LLM config
);
```

## Adding a New Prompt

1. **Add entry to `registry.js`**:
```javascript
myPrompt: {
  version: '1.0.0',
  description: 'What this prompt does',
  build: (context) => {
    const { requiredField, optionalField = 'default' } = context;

    return {
      system: `Your prompt template using ${requiredField}`,
      maxTokens: 400
    };
  }
}
```

2. **Use it**:
```javascript
const prompt = getPrompt('myPrompt', { requiredField: 'value' });
```

3. **Submit PR** with:
   - Clear description of use case
   - Example input/output
   - Version bumped if editing existing

## Editing an Existing Prompt

1. Find prompt by name in `registry.js`
2. Edit the template string
3. **Bump version number** (1.0.0 → 1.0.1 for minor tweaks, 1.1.0 for significant changes)
4. Submit PR with before/after examples
5. Test thoroughly before merging

## Best Practices

### ✅ DO

- Keep prompts under 500 chars (before dynamic content injection)
- Be specific and actionable
- Include clear rules/constraints
- Use semantic versioning
- Document required context fields
- Test with edge cases (empty data, missing fields)

### ❌ DON'T

- Hardcode prompts anywhere else in codebase
- Make `build()` functions throw errors
- Use overly generic instructions
- Include sensitive data in prompts
- Override user's message with `prompt.user` (only use as fallback)

## Debugging

```javascript
import { listPrompts, validateContext } from './registry.js';

// List all available prompts
console.log(listPrompts());

// Validate context before calling
validateContext('ask', { tabs: [...] });
// Logs warnings for missing fields
```

## Token Budgets

Each prompt specifies `maxTokens` as a suggestion:

- `ask`: 1000 (can be long, needs context)
- `standup`: 300 (short, structured output)
- `summarizeTabs`: 400 (medium, grouping needed)
- `briefing`: 400 (medium, recap + schedule)
- `continueWork`: 500 (longer, per-page analysis)
- `patternInsight`: 300 (short, data-driven)

These are **suggestions** - actual token usage depends on input length.

## Version History

Track major prompt changes here:

- **1.0.0** (2026-02-28): Initial prompt registry with 6 core prompts
