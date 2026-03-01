# OpenOwl

**AI browser memory for developers. All tabs context, workday tracking, BYOK (Bring Your Own Key). Local-first. Zero servers.**

> A Chrome extension that gives developers AI-powered memory across all their open tabs and work history - completely private and local-first.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🤖 **Ask AI about your work** - Query across all open tabs and browsing history
- 📊 **Track your workday** - Automatic logging of everything you work on
- 🌅 **Morning briefings** - Start each day with a summary of yesterday's work
- 📝 **Generate standups** - One-click standup updates from your activity
- 🔐 **Privacy-first** - All data stored locally, no servers, no tracking
- 🔑 **BYOK** - Use your own API key (Claude, OpenAI, Gemini, or local Ollama)

## 🚀 Installation

### Chrome Web Store
_Coming soon_ - We're working on publishing to the Chrome Web Store.

### Install from Source

1. Clone and install
   ```bash
   git clone https://github.com/yourusername/openowl.git
   cd openowl
   npm install
   ```

2. Build the extension
   ```bash
   npm run dev
   ```

3. Load in Chrome
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

## 🔧 Configuration

1. Click the OpenOwl icon in Chrome toolbar
2. Go to **Settings** tab
3. Select your LLM provider:
   - **Ollama** (local)
   - **Anthropic Claude**
   - **OpenAI**
   - **Google Gemini**
4. Enter your API key
5. Click **Save Settings**

## 🏗️ Tech Stack

- **Chrome Extension Manifest V3**
- **React 18** + **Vite** - Fast, modern UI
- **Tailwind CSS** - Styling
- **IndexedDB** - Local data storage
- **Chrome Storage API** - Settings & API keys
- **@crxjs/vite-plugin** - Chrome extension build tooling

## 📖 Documentation

- [Setup Guide](./SETUP.md) - Detailed setup and architecture
- [Icon README](./public/icons/README.md) - Icon design system

## 🤝 Contributing

Contributions welcome! Feel free to open issues or submit PRs.

1. Fork the repo
2. Create your branch (`git checkout -b feature/my-feature`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push (`git push origin feature/my-feature`)
5. Open a PR

## 🔒 Privacy & Security

- ✅ **All data stored locally** - Chrome storage and IndexedDB only
- ✅ **No external servers** - Except your chosen LLM provider
- ✅ **No tracking or analytics** - Zero telemetry
- ✅ **No third-party scripts** - Everything bundled locally
- ✅ **API keys never logged** - Stored securely in Chrome storage
- ✅ **Open source** - Fully auditable code

## 📋 Roadmap

- [x] Settings UI with multi-provider support
- [x] LLM abstraction layer
- [x] Content script for page tracking
- [x] Storage layer (chrome.storage + IndexedDB)
- [ ] Tab reader - Read all open tabs
- [ ] AI chat interface
- [ ] Today's activity log
- [ ] Morning briefing generation
- [ ] Standup writer
- [ ] Pattern learning

## 📄 License

MIT License - see [LICENSE](LICENSE)

---

**Built for developers who want AI assistance without giving up their data.**
