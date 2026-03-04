---
apply: always
---

# OpenOwl AI Rules

## Architecture — Non-Negotiable

- All LLM calls in background/index.js only
  Never call LLM from content scripts or components

- All prompts in src/prompts/registry.js only
  Never inline prompt strings elsewhere

- All templates in src/prompts/templates.js only
  Never add template logic in components

- All storage in src/storage/index.js only
  Never call IndexedDB directly from components

- Site extractors in src/content/extractors/sites/
  Always extend BaseSiteExtractor
  Always register in registry.js

- Never use localStorage
  Use chrome.storage.local for settings/prefs
  Use IndexedDB (openowl-db) for day logs

- Never add setInterval polling
  Use chrome.runtime.onMessage event listeners

## Patterns — Always Follow

- Display names: use getDisplayName(domain)
  Never use raw domain strings in UI or prompts

- New prompts: add to PromptRegistry in registry.js
  Use getPrompt('name', context) to call them
  Bump version number on every change
  Update validateContext expectedFields

- New templates: add to TEMPLATES in templates.js
  Must have: label, type, category,
  triggers[], gather(), prompt
  type is either 'auto' or 'prompt' only

- New extractors: extend BaseSiteExtractor
  Must implement: domains, name, description, extract()
  Register in EXTRACTORS array in registry.js
  Never throw — always return buildFallbackResult()

- Token budget: never exceed 4000 tokens total
  History entries sorted by activeTime descending
  Drop oldest/lowest signal entries first

## Data — Know The Difference

- source: 'history_import' = no content, no activeTime
  Use title + URL to infer meaning
  Never treat as real activity for stats

- activeTime = 0 is common and normal
  Do not filter these out entirely
  Use visitCount as fallback signal

- copied[] = array of strings, not objects
  Access as: entry.copied[0]
  Not: entry.copied[0].text

## Don'ts

- Don't add UI components for things
  that can be handled in background.js

- Don't duplicate formatLogEntries()
  It exists as shared helper, use it

- Don't hardcode domain names in UI
  Always go through getDisplayName()

- Don't add new npm packages
  without flagging it first

- Don't modify manifest.json permissions
  without flagging it first

## File Ownership — Change Only What's Asked

If asked to fix Today.jsx:
→ Only change Today.jsx
→ Do not refactor storage/index.js
→ Do not "improve" unrelated code

Show the file first.
Confirm understanding.
Then make changes.