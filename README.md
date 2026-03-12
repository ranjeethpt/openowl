<div align="center">
  <img src="public/icons/icon128.png" alt="OpenOwl Logo" width="128" height="128">

# OpenOwl

**AI memory for your browser workday. No API key required to get started. All tabs context, workday tracking, custom templates. Local-first. Zero servers.**

> A Chrome extension that remembers what you work on across all your tabs and helps you write standups, find things you researched, and understand where your time goes. Completely private and local-first.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

## ✨ Features

### 🎯 Smart AI Chat
- **Ask across all tabs** - Query everything you have open and everything you have worked on
- **Context-aware responses** - AI knows what you are working on right now
- **Multi-turn conversations** - Follow-up questions maintain context
- **Template shortcuts** - One-click actions for your most common tasks

### 📋 Built-in Quick Actions
Ready to use from day one:
- ✍️ **Write standup** - Daily update for your team
- 📊 **Day summary** - What you worked on today
- 🎯 **What to focus on** - Priority based on your open tabs
- 📅 **Week wrap** - End of week summary
- 🔍 **Remind me of** - Find something you worked on before
- 📅 **Prep for** - Context for an upcoming meeting

### 📋 Custom Templates
Build your own one-click actions for workflows you repeat.
- **Visual template builder** - No coding required
- **Flexible filters** - Time ranges, domains, live or imported history
- **Custom instructions** - Tell the AI exactly what you want
- **Reusable** - Save once, use every day

### 📊 Workday Tracking
- **Automatic logging** - Tracks what you work on as you browse
- **Copy tracking** - Remembers snippets you copied from pages
- **History import** - Last 30 days imported on first install so standup works immediately
- **Privacy controls** - Never-track list for personal and non-work sites

### 🔐 Data & Privacy
- ✅ **All activity stored locally** - Chrome storage and IndexedDB only, on your device
- ✅ **No OpenOwl servers** - Nothing sent to us, ever
- ✅ **You choose your AI** - Prompts sent only to the provider you configure
- ✅ **No analytics or telemetry** - Zero tracking
- ✅ **Open source** - Fully auditable

### 🤖 Works Your Way

With an API key:
- **Anthropic Claude** 
- **OpenAI** (GPT-4o, GPT-4)
- **Google Gemini**
- **Ollama** (local, free, nothing leaves your machine)

Without an API key:
- **Copy prompt** — every template builds your prompt with real data and copies it to clipboard. Paste into ChatGPT, Gemini, Claude.ai, or any AI chat tool in your browser. No setup. Works on day one.

## 🚀 Quick Start

### Chrome Web Store
_Coming soon_ — Publishing to Chrome Web Store in progress.

### Install from Source

1. **Clone and install**
   ```bash
   git clone https://github.com/yourusername/openowl.git
   cd openowl
   npm install
   ```

2. **Build**
   ```bash
   npm run dev    # Development mode
   # OR
   npm run build  # Production build
   ```

3. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right toggle)
   - Click **Load unpacked**
   - Select the `dist/` folder

4. **Configure your AI**
   - Click the OpenOwl 🦉 icon in Chrome toolbar
   - Go to **Settings** tab
   - Select your AI provider and enter your API key
   - Click **Save Settings**

## 📖 Usage

### Day one
OpenOwl imports your last 30 days of browser history on install.
Open the Ask tab and click **Write standup** — it already knows what you have been working on.

### Ask Tab
Click any template or type your own question:
```
"What am I working on today?"
"Write my standup"
"Remind me of that API rate limit issue I looked into"
"What Jira tickets did I work on this week?"
```

### Creating Custom Templates

1. Go to **Settings** → **📋 Custom Templates**
2. Click **Create template**
3. Fill in the details:
   - **Name**: GitHub PRs this week
   - **Icon**: 🚀
   - **Time range**: Last 7 days
   - **Domains**: github.com
   - **Instructions**: List all pull requests I reviewed or raised
4. Click **Save**
5. Your template appears in the Ask tab immediately

### Example Custom Templates

**Jira this week**
- Time: This week
- Domains: atlassian.net
- Instructions: Group by ticket ID, show what I did on each

**GitHub activity**
- Time: Last 7 days
- Domains: github.com
- Instructions: PRs raised, reviewed, and merged

**Research log**
- Time: Last 14 days
- Domains: stackoverflow.com, github.com
- Instructions: What technical topics did I research

## 🏗️ Architecture

### File Structure
```
openowl/
├── src/
│   ├── background/          # Service worker — all LLM calls live here
│   ├── content/             # Content scripts + extractors
│   │   └── extractors/      # Site-specific content extractors
│   ├── sidebar/             # React UI
│   │   └── components/      # Ask, Activity, Settings
│   ├── prompts/             # LLM prompt system
│   │   ├── registry.js      # All prompts defined here
│   │   └── templates.js     # Template definitions
│   ├── storage/             # Storage abstraction
│   ├── llm/                 # Multi-provider LLM client
│   └── utils/               # Shared utilities
├── public/                  # Static assets + manifest
└── dist/                    # Built extension
```

### Tech Stack
- **Chrome Extension Manifest V3**
- **React 18** + **Vite**
- **Tailwind CSS**
- **IndexedDB** (idb) — activity log
- **Chrome Storage API** — settings and templates
- **@crxjs/vite-plugin** — Chrome extension build tooling

### Data Flow

1. **Content Script** → Extracts page content using site-specific extractors
2. **Background Service** → Logs activity to IndexedDB
3. **Template Clicked** → Gathers filtered data based on template config
4. **Prompt Builder** → Constructs prompt from registry
5. **LLM Call** → Sent to your chosen provider
6. **Response** → Shown in Ask tab

## 📚 Documentation

- [**CONTRIBUTING.md**](./CONTRIBUTING.md) — Adding extractors, templates, prompts
- [**SETUP.md**](./SETUP.md) — Setup and architecture detail
- [**public/icons/README.md**](./public/icons/README.md) — Icon system

## 🤝 Contributing

Contributions welcome. Most wanted:

- **Site extractors** — Add support for more websites (Linear, Notion, Confluence, Datadog, etc.)
- **Built-in templates** — Useful templates for common workflows
- **Bug fixes** — Found something broken? Open a PR
- **Documentation** — Improve guides and examples

**Steps:**

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make changes and test locally
4. Commit (`git commit -m 'Add my feature'`)
5. Push and open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guides on adding extractors, templates, and prompts.

## 🐛 Debugging

Open the service worker console:
```
chrome://extensions → OpenOwl → service worker link
```

Test storage in the console:
```javascript
// Check custom templates
chrome.storage.local.get('customTemplates', console.log)

// Check recent activity
const db = await openDB('openowl-db')
const logs = await db.getAll('dayLogs')
console.table(logs.slice(-10))
```

## 🗺️ Roadmap

**Completed ✅**
- [x] Multi-provider LLM support (Claude, OpenAI, Gemini, Ollama)
- [x] Activity tracking with site-specific extractors
- [x] Built-in template system
- [x] Custom template builder
- [x] History import on first install
- [x] Copy tracking
- [x] Multi-turn conversations
- [x] Privacy controls and never-track list

**Upcoming 🚧**
- [ ] Chrome Web Store publishing
- [ ] Export templates (share with your team)
- [ ] Slack integration (post standup directly)

**Future 💭**
- [ ] Team templates (shared within organisation)
- [ ] Calendar integration (meeting prep automation)
- [ ] Pattern learning (frequent workflows)

## ❓ FAQ
**Do I need an API key?**
No. Every template has a Copy prompt button that builds your prompt with your real work data and copies it to clipboard. Paste into ChatGPT, Gemini, Claude.ai, or any AI tool you already use. If you want responses directly in the sidebar, add an API key in Settings. For maximum privacy with no API costs, run Ollama locally.

**Is my data private?**
All activity is stored locally on your device. Nothing is sent to OpenOwl or any third party. The only external calls are to the AI provider you configure — which you control.

**Which AI provider should I use?**
For maximum privacy, use Ollama (runs locally, free, nothing leaves your machine). For best quality, Claude or GPT-4o.

**Does it work without an API key?**
Yes, with Ollama running locally. Download from [ollama.ai](https://ollama.ai). No API key needed.

**What does it track?**
Everything you visit during your workday by default, minus sites in your never-track list. YouTube, Netflix, social media and search engines are excluded by default. You control the list in Settings → Preferences.

**Can I use it if my company blocks API keys in extensions?**
Yes. Each template has a **Copy prompt** button that builds your prompt with real data and copies it to clipboard. Paste into ChatGPT, Gemini, or any AI chat tool in your browser.

⚠️ Before pasting, review what's been copied. Prompts include real page content from your tabs and browsing history, which may contain sensitive, confidential, or proprietary information. Always check the clipboard contents match your company's acceptable use policy before sharing with any external AI service.

## 📄 License

MIT — see [LICENSE](LICENSE)

## 🙏 Built With

- [Vite](https://vitejs.dev/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [idb](https://github.com/jakearchibald/idb)
- [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin/)

---

**Built for anyone whose job lives in a browser.**

🦉 **OpenOwl** — Your work, your memory, your privacy.