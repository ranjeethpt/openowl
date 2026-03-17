# Privacy Policy — OpenOwl

**Last updated: March 2026**

---

## Overview

OpenOwl is a local-first Chrome extension. Your data stays in your browser. OpenOwl has no servers, no accounts, and no analytics.

---

## What Data OpenOwl Collects

OpenOwl collects and stores the following data **locally in your browser only**:

**Browser activity logs**
Pages you visit while OpenOwl is active — including page title, URL, domain, time spent, and extracted page content. This data is stored in IndexedDB in your browser and never leaves your device.

**Copied text snippets**
Text you copy from pages while browsing. Used to improve the relevance of AI summaries and answers. Stored locally only.

**Settings and API keys**
Your chosen LLM provider, selected model, and API key. Stored in Chrome's local storage only. Never transmitted to OpenOwl or any third party.

---

## What Data OpenOwl Does NOT Collect

- No names, email addresses, or personal identification
- No passwords or authentication credentials
- No financial or payment information
- No health information
- No location data
- No data is sent to OpenOwl servers (OpenOwl has no servers)
- No analytics, no telemetry, no crash reporting

---

## How Your Data Is Used

Your locally stored activity data is used for one purpose only: to build context for AI queries you initiate.

When you ask OpenOwl a question or generate a summary, it assembles relevant context from your local activity logs and open tabs, and sends that context — along with your question — to your chosen LLM provider (Anthropic Claude, OpenAI, Google Gemini, or a local Ollama instance).

**Your API key is used solely to authenticate requests to your chosen LLM provider. It is never sent to OpenOwl.**

---

## Third Party Data Sharing

OpenOwl does not sell, share, or transfer your data to any third party.

The only external service that receives any data is your chosen LLM provider, and only when you explicitly initiate a query. This transmission is governed by your LLM provider's own privacy policy:

- Anthropic: https://www.anthropic.com/privacy
- OpenAI: https://openai.com/policies/privacy-policy
- Google: https://policies.google.com/privacy
- Ollama: local only, no data leaves your machine

---

## Data Storage and Retention

All data is stored locally in your browser:

- **Activity logs** — stored in IndexedDB, automatically cleaned up after 30 days
- **Settings and API keys** — stored in chrome.storage.local
- **Copied snippets** — stored as part of activity log entries

You can delete all stored data at any time by:
- Removing the extension from Chrome
- Clearing your browser's local storage and IndexedDB for the extension
- Using the clear data option in OpenOwl settings (if available)

---

## Open Source

OpenOwl is fully open source under the MIT licence. You can read every line of code at:

**https://github.com/ranjeethpt/openowl**

There are no hidden data collection mechanisms. The code is publicly auditable.

---

## Changes to This Policy

If this privacy policy changes materially, the updated policy will be posted at this URL with an updated date. Given OpenOwl's local-first architecture, any future changes would only ever add transparency, not reduce it.

---

## Contact

If you have questions about this privacy policy or OpenOwl's data practices, open an issue at:

**https://github.com/ranjeethpt/openowl/issues**
