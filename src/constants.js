// Provider keys - single source of truth for provider identifiers
export const PROVIDERS = {
  CLAUDE: 'claude',
  OPENAI: 'openai',
  GEMINI: 'gemini',
  OLLAMA: 'ollama'
};

// Provider display names - single source of truth
export const PROVIDER_NAMES = {
  [PROVIDERS.CLAUDE]: 'Anthropic Claude',
  [PROVIDERS.OPENAI]: 'OpenAI',
  [PROVIDERS.GEMINI]: 'Google Gemini',
  [PROVIDERS.OLLAMA]: 'Ollama'
};

export const DEFAULT_SETTINGS = {
  selectedProvider: PROVIDERS.OLLAMA,
  selectedModel: 'claude-sonnet-4-20250514',
  apiKeys: {},
  ollamaUrl: 'http://localhost:11434'
};

export const DEFAULT_PREFERENCES = {
  neverTrack: [
    'youtube.com',
    'netflix.com',
    'twitch.tv',
    'spotify.com',
    'soundcloud.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'facebook.com',
    'tiktok.com',
    'reddit.com',
    'amazon.com',
    'ebay.com',
    'etsy.com'
  ],
  workHours: {
    enabled: false, // Track all day by default for better standup data
    start: '08:00',
    end: '19:00'
  },
  minActiveTimeMs: 3000, // 3 seconds - catch quick reference visits
  logRetentionDays: 90, // 90 days for better historical context
  duplicateVisitWindowMs: 5 * 60 * 1000, // 5 minutes - prevent duplicate entries
  insightCacheTtlMs: 12 * 60 * 60 * 1000, // 12 hours - cache TTL for LLM insights
  defaultHistoryImportDays: 30 // Default lookback period for history import
};
