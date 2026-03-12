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

Before adding any logic to a component, ask:
Does a hook already exist for this in hooks/?
Does a helper already exist in utils/?
Does a storage function already exist in storage/index.js?

If yes: import it.
If no: create the abstraction first, then import it.
Never inline logic that belongs in a shared location.

## UI — Assets and Branding

Never use owl emoji (🦉) in the UI.
The extension has a real logo.

Use the actual logo image:
/public/icons/icon48.png for inline use
/public/icons/icon128.png for larger display

In JSX:
<img src="/icons/icon48.png" alt="OpenOwl" />

The owl emoji should not be used anywhere like in documentation or 
README, UI etc.

## No Magic Strings — Single Source of Truth

Any string that identifies something that already
exists as a key or value in a data structure
must never be hardcoded again elsewhere.

Derive from the source. Never duplicate.

IDENTIFIERS:
Wrong:  if (provider === 'claude')
Right:  provider is already stored in settings.
Read from there. Do not re-declare the
string in a new place.

Wrong:  const models = ['claude', 'openai', 'gemini']
Right:  Object.keys(models) where models object
already exists in Settings.jsx or constants.

LISTS DERIVED FROM CONFIG:
Wrong:  const copyable = ['standup', 'daySummary']
Right:  Add copyable: true flag to each template.
Filter TEMPLATES by that flag.
The template object is the source of truth.

Wrong:  const cloudProviders = ['claude', 'openai', 'gemini']
Right:  Add local: false to each provider config.
Derive the list from that flag.

FEATURE FLAGS AND CONDITIONS:
Wrong:  if (['claude', 'openai'].includes(provider))
Right:  if (provider.requiresApiKey === true)
Add the property to the provider definition.

REGISTRY KEYS:
getPrompt('standup', context) is the one exception.
Registry key strings must match exactly by design.
Add a comment when using them so it is clear:
getPrompt('standup', context) // registry key — must match registry.js

RULE OF THUMB:
If you are typing a string that you have typed
before somewhere else in the codebase,
stop and find where it came from.
Reference that source instead or convert to a proper type or object or JS doc
If a condition needs a list of things,
add a property to the thing's definition
and derive the list from there.

## Shared Hooks — No Duplicate Logic

Before implementing logic in a component, check if
a hook already exists for it in src/sidebar/hooks/.

Current shared hooks:
- useCopyPrompt — all copy prompt logic lives here
- useToast — all toast notifications live here

Never implement copy prompt logic in a component.
Never implement toast logic in a component.
Import the hook instead.

If you need similar logic in a new place:
Check hooks/ first.
If a hook exists: import it.
If logic does not exist yet: create a hook, not inline code.
Never copy-paste logic between components.
That is how duplicate bugs are born.

## Constants — No Inline Magic Values

Any value that controls behaviour and might
ever need to change belongs in a constants file.
Never inline it at the point of use.

File: src/constants.js
This is the single source for all magic values.

Examples of what goes in constants:

THRESHOLDS:
Wrong:  if (liveEntries.length < 3)
Right:  if (liveEntries.length < BRIEFING_THRESHOLD)

Wrong:  if (activeTime > 10000)
Right:  if (activeTime > MIN_ACTIVE_TIME_MS)

Wrong:  slice(0, 50)
Right:  slice(0, MAX_HISTORY_ENTRIES)

Wrong:  setTimeout(hide, 3000)
Right:  setTimeout(hide, TOAST_DURATION_MS)

DEFAULTS:
Wrong:  retention: 30
Right:  retention: DEFAULT_RETENTION_DAYS

Wrong:  maxLength: 2000
Right:  maxLength: MAX_PAGE_CONTENT_CHARS

Wrong:  maxTabs: 8
Right:  maxTabs: MAX_TABS_SENT_TO_LLM

Wrong:  n: 7 (in last_n_days)
Right:  n: DEFAULT_HISTORY_DAYS

RULE OF THUMB:
If a number or string controls behaviour
and you had to think about what value to use,
it belongs in constants.js not inline.
If it changes in one place it should
change everywhere automatically.

Current constants that already exist
must be imported from constants.js.
Never redeclare them locally.