# Security Policy — OpenOwl

## Overview

OpenOwl is a local-first Chrome extension. This document explains our permissions model, what data is collected, how it is used, and how to report security vulnerabilities.

---

## Chrome Manifest Permissions

OpenOwl declares the following permissions in `manifest.json`. Every permission is actively used. We do not request permissions speculatively or for future use.

| Permission | Why It Is Required |
|---|---|
| `storage` | Stores API keys, user settings, and preferences in `chrome.storage.local`. Also used for caching LLM-generated insights with a TTL. Nothing is stored in `chrome.storage.sync` — all data stays on the user's device. |
| `tabs` | Reads the title and URL of open tabs to build work context for AI queries. Used by the Tab Reader to extract content from active tabs via the extractor registry. |
| `history` | Reads browser history on first install to provide immediate context before live activity has accumulated. Also used by the memory search feature to find past work across all recorded activity. |
| `alarms` | Schedules automatic chat history clearing at midnight and periodic cleanup of activity logs older than 30 days. |
| `sidePanel` | OpenOwl's entire UI lives in Chrome's native side panel. This permission is required to register and open the side panel. |

### Host Permissions

OpenOwl requests host permissions to read page content from sites the user is actively browsing. This powers the site-specific extractor registry (GitHub, Linear, Notion, Gmail, Google Calendar, Atlassian etc).

Content is only extracted from tabs the user has open. OpenOwl does not crawl, scan, or access pages in the background.

---

## What Data OpenOwl Collects

| Data | Where Stored | Sent Externally? |
|---|---|---|
| Page title, URL, domain | IndexedDB (local) | No |
| Extracted page content | IndexedDB (local) | Only to your LLM provider when you ask a question |
| Time spent on page | IndexedDB (local) | No |
| Text copied from pages | IndexedDB (local) | Only to your LLM provider when you ask a question |
| API keys | chrome.storage.local | No — only used to authenticate requests you initiate |
| LLM provider preference | chrome.storage.local | No |
| Cached AI insights | chrome.storage.local | No |

---

## What OpenOwl Explicitly Does NOT Do

- Does not collect names, email addresses, or any personally identifiable information
- Does not access password fields or authentication forms
- Does not run in the background on pages the user has not opened
- Does not send data to any OpenOwl server (OpenOwl has no servers)
- Does not use remote code — all JavaScript is bundled in the extension package
- Does not use `eval()` or dynamic code execution
- Does not inject scripts into pages without the user actively using the extension
- Does not track clicks, mouse position, keystrokes, or scroll behaviour
- Does not access microphone, camera, or any device hardware
- Does not sync data across devices via `chrome.storage.sync`

---

## LLM Provider Data Flow

When a user asks a question or generates a summary, OpenOwl:

1. Reads relevant entries from local IndexedDB
2. Reads content from open tabs (if the query requires it)
3. Builds a context prompt locally
4. Sends the prompt + context to the user's chosen LLM provider via their API key
5. Displays the response in the sidebar

**The only external network request OpenOwl ever makes is to the user's chosen LLM provider API endpoint.** No data passes through OpenOwl infrastructure.

LLM provider endpoints:
- Anthropic: `https://api.anthropic.com`
- OpenAI: `https://api.openai.com`
- Google Gemini: `https://generativelanguage.googleapis.com`
- Ollama: `http://localhost:11434` (local only)

---

## Architecture Security Notes

**Service Worker only for LLM calls**
All LLM API calls are made from `background/index.js` (the service worker). Content scripts cannot make LLM calls directly. API keys are never accessible from content scripts.

**No remote code**
OpenOwl does not load any JavaScript from external URLs. All code is bundled at build time via Vite. There are no `<script src="...">` references to external files and no use of `eval()`.

**Content extraction limits**
Page content is capped at 2000 characters per page and a maximum of 8 tabs are included in any single LLM context. This limits both data exposure and token usage.

**API keys**
API keys are stored in `chrome.storage.local` only. They are never logged, never included in error reports, and never sent anywhere except the user's chosen LLM provider endpoint.

---

## Reporting a Vulnerability

If you discover a security vulnerability in OpenOwl, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please open a private security advisory on GitHub:

1. Go to `https://github.com/ranjeethpt/openowl/security/advisories`
2. Click **New draft security advisory**
3. Describe the vulnerability, steps to reproduce, and potential impact

We will respond within 72 hours and work with you to resolve the issue before any public disclosure.

---

## Permissions Change Log

Any change to the permissions declared in `manifest.json` will be documented here.

| Date | Change | Reason |
|---|---|---|
| March 2026 | Initial permissions: `storage`, `tabs`, `history`, `alarms`, `sidePanel` | Launch |

---

## Open Source Audit

OpenOwl is fully open source under the MIT licence. All code is publicly auditable at:

**https://github.com/ranjeethpt/openowl**

The manifest file is at `public/manifest.json` in the repository.