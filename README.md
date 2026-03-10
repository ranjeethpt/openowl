<div align="center">
  <img src="public/icons/icon128.png" alt="OpenOwl Logo" width="128" height="128">

  # OpenOwl

  **AI browser memory for people who work in tabs. All tabs context, workday tracking, custom templates. Local-first. Zero servers.**

  > A Chrome extension that gives developers AI-powered memory across all their open tabs and work history - with the ability to create custom templates for repeated lookups. Completely private and local-first.

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

## ✨ Features

### 🎯 Smart AI Chat
- **Ask across all tabs** - Query all open tabs and browsing history at once
- **Context-aware responses** - AI knows what you're working on
- **Multi-turn conversations** - Follow-up questions maintain context
- **Template-based shortcuts** - One-click actions for common tasks

### 📋 Custom Templates
**NEW:** Create your own custom templates without writing code!
- **Visual template builder** - No coding required
- **Flexible filters** - Time ranges, domains, source (live/history)
- **Custom instructions** - Tell the AI exactly what you want
- **Reusable workflows** - Save templates for repeated lookups

Built-in templates:
- ✍️ **Write standup** - Daily update for your team
- 📊 **Day summary** - What you worked on today
- 🎯 **What to focus on** - Priority based on open tabs
- 📅 **Week wrap** - End of week summary
- 🔍 **Remind me of** - Search your work history
- 📅 **Prep for** - Context for upcoming meetings

### 📊 Activity Tracking
- **Automatic workday logging** - Tracks what you work on
- **Smart filtering** - Active time, visit counts, scroll depth
- **Copy tracking** - Remembers snippets you copied
- **History import** - Last 30 days imported on first install
- **Privacy controls** - Never-track list for personal sites

### 🔐 Privacy & Security
- ✅ **100% local-first** - All data in Chrome storage and IndexedDB
- ✅ **No servers** - Except your chosen LLM provider
- ✅ **No tracking** - Zero telemetry or analytics
- ✅ **Open source** - Fully auditable code
- ✅ **BYOK** - Bring your own API key

### 🤖 Multi-Provider Support
Choose your LLM provider:
- **Ollama** (local, free, maximum privacy)
- **Anthropic Claude** (recommended)
- **OpenAI** (GPT-4, GPT-3.5)
- **Google Gemini**

## 🚀 Quick Start

### Chrome Web Store
_Coming soon_ - We're working on publishing to the Chrome Web Store.

### Install from Source

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/yourusername/openowl.git
   cd openowl
   npm install
   ```

2. **Build the extension**
   ```bash
   npm run dev    # Development mode with hot reload
   # OR
   npm run build  # Production build
   ```

3. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist/` folder

4. **Configure your LLM**
   - Click the OpenOwl 🦉 icon in Chrome toolbar
   - Go to **Settings** tab
   - Select provider and enter API key
   - Click **Save Settings**

## 📖 Usage

### Ask Tab
Click any template button or type your question:
```
"What am I working on?"
"Write my standup"
"Remind me of that API I found yesterday"
```

### Creating Custom Templates

1. Go to **Settings** → **📋 Custom Templates**
2. Click **Create template**
3. Configure your template:
   - **Name**: "GitHub PRs this week"
   - **Icon**: 🚀
   - **Time range**: Last 7 days
   - **Domains**: github.com
   - **Instructions**: "List all pull requests I reviewed"
   - **Output format**: Bullets
4. Click **Create**
5. Your template appears in the Ask tab!

### Example Custom Templates

**JIRA Tickets Today**
- Time: Today
- Domains: atlassian.net
- Instructions: Group by ticket ID, show status

**Research Summary**
- Time: Last 7 days
- Domains: stackoverflow.com, github.com
- Source: Live only
- Instructions: Summarize technical topics researched

**Meeting Prep**
- Time: Yesterday
- Include tabs: ✓
- Instructions: Context for standup meeting

## 🏗️ Architecture

### File Structure
```
openowl/
├── src/
│   ├── background/          # Service worker
│   ├── content/            # Content scripts + extractors
│   │   └── extractors/     # Site-specific extractors
│   ├── sidebar/            # React UI components
│   │   └── components/     # Settings, Ask, Today, etc.
│   ├── prompts/            # LLM prompt system
│   │   ├── registry.js     # All prompts
│   │   └── templates.js    # Template definitions
│   ├── storage/            # Storage abstraction
│   ├── llm/               # Multi-provider LLM client
│   └── utils/             # Utilities
├── public/                # Static assets
└── dist/                  # Built extension
```

### Tech Stack
- **Chrome Extension Manifest V3**
- **React 18** + **Vite** - Fast, modern UI
- **Tailwind CSS** - Styling
- **IndexedDB** (idb) - Activity log storage
- **Chrome Storage API** - Settings & templates
- **@crxjs/vite-plugin** - Chrome extension dev tooling

### Data Flow

1. **Content Script** → Extracts page content using site-specific extractors
2. **Background Service** → Logs activity to IndexedDB
3. **User Clicks Template** → Gathers filtered data via `buildCustomGatherer()`
4. **Prompt Builder** → Constructs LLM prompt from template config
5. **LLM Call** → Sends to user's chosen provider
6. **Response** → Displayed in Ask tab

## 📚 Documentation

- [**CONTRIBUTING.md**](./CONTRIBUTING.md) - How to add extractors, templates, prompts
- [**SETUP.md**](./SETUP.md) - Detailed setup and architecture
- [**src/prompts/README.md**](./src/prompts/README.md) - Prompt system architecture
- [**src/prompts/templates/README.md**](./src/prompts/templates/README.md) - Template guide
- [**public/icons/README.md**](./public/icons/README.md) - Icon design system

## 🤝 Contributing

Contributions welcome! We'd love help with:

- **Site extractors** - Add support for more websites (Linear, Notion, Confluence, etc.)
- **Built-in templates** - New useful templates
- **Bug fixes** - Found an issue? Submit a PR!
- **Documentation** - Improve guides and examples

**Quick contribution guide:**

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Make changes and test locally
4. Commit (`git commit -m 'Add amazing feature'`)
5. Push (`git push origin feature/amazing-feature`)
6. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guides on:
- Adding site extractors
- Creating new templates
- Writing LLM prompts
- Testing and debugging

## 🐛 Debugging

Open the service worker console:
```
chrome://extensions → OpenOwl → "service worker" link
```

Test storage functions:
```javascript
// Get custom templates
const templates = await chrome.storage.local.get('customTemplates')
console.table(templates.customTemplates)

// Get activity entries
const db = await indexedDB.open('openowl-db')
const tx = db.transaction('dayLogs', 'readonly')
const logs = await tx.objectStore('dayLogs').getAll()
console.table(logs)
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more debugging commands.

## 🗺️ Roadmap

**Completed ✅**
- [x] Multi-provider LLM support (Claude, OpenAI, Gemini, Ollama)
- [x] Activity tracking with site-specific extractors
- [x] Smart template system
- [x] Custom template builder (no code required)
- [x] History import (30 days on first install)
- [x] Copy tracking
- [x] Multi-turn conversations
- [x] Privacy controls (never-track list, work hours)

**Upcoming 🚧**
- [ ] Week/month activity analytics
- [ ] Pattern learning (frequent workflows)
- [ ] Browser history search integration
- [ ] Export templates (share with team)
- [ ] Chrome Web Store publishing

**Future Ideas 💭**
- [ ] Slack integration (post standups)
- [ ] Calendar integration (meeting prep)
- [ ] Team templates (shared within organization)
- [ ] Mobile companion app

## ❓ FAQ

**Q: Is my data private?**
A: Yes! All data is stored locally in Chrome. Nothing is sent to external servers except LLM API calls (which you control).

**Q: Which LLM provider should I use?**
A: For maximum privacy, use Ollama (local, free). For best quality, use Claude or GPT-4.

**Q: How much does it cost?**
A: OpenOwl is free. You only pay for LLM API usage (or use free local Ollama).

**Q: Can I use it without an API key?**
A: Yes, with Ollama running locally. Download from [ollama.ai](https://ollama.ai).

**Q: Does it track everything I browse?**
A: You control what's tracked via Settings → Preferences → Never Track list. Personal sites (YouTube, Netflix, etc.) are excluded by default.

**Q: Can I export my data?**
A: Data is in IndexedDB. See debugging section for export commands. Template export feature coming soon.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with:
- [Vite](https://vitejs.dev/) - Lightning fast build tool
- [React](https://react.dev/) - UI framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [idb](https://github.com/jakearchibald/idb) - IndexedDB wrapper
- [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin/) - Chrome extension Vite plugin

---

**Built for people who work in tabs and want AI assistance without giving up their data.**

🦉 **OpenOwl** - Your work, your memory, your privacy.
