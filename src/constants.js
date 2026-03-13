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
  selectedProvider: null, // No default - user must select
  selectedModel: '', // No default - auto-fetched based on provider selection
  apiKeys: {},
  ollamaUrl: 'http://localhost:11434'
};

// Model context window limits (in tokens)
// Conservative estimates to leave room for response
export const MODEL_CONTEXT_LIMITS = {
  // Claude models
  'claude-sonnet-4-20250514': 180000, // 200k context, use 180k for safety
  'claude-3-5-sonnet-20241022': 180000,
  'claude-3-5-sonnet-20240620': 180000,
  'claude-3-5-haiku-20241022': 180000,
  'claude-3-opus-20240229': 180000,
  'claude-3-sonnet-20240229': 180000,
  'claude-3-haiku-20240307': 180000,

  // OpenAI models
  'gpt-4o': 120000, // 128k context
  'gpt-4o-mini': 120000,
  'gpt-4-turbo': 120000,
  'gpt-4': 7000, // 8k context
  'gpt-3.5-turbo': 15000, // 16k context

  // Gemini models
  'gemini-2.0-flash-exp': 950000, // 1M context
  'gemini-1.5-pro': 1900000, // 2M context
  'gemini-1.5-flash': 950000,
  'gemini-1.0-pro': 28000, // 32k context

  // Ollama - depends on model, use conservative default
  'ollama': 28000, // 32k default for most models

  // Default fallback
  'default': 28000 // Safe default for unknown models
};

// Tab fetch timeout settings
export const TAB_FETCH_TIMEOUT = {
  base: 2000, // Base timeout in ms
  perTab: 50, // Additional ms per tab
  max: 10000 // Maximum timeout in ms
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

// Activity tab stats configuration
export const STATS_CONFIG = {
  lookbackDays: 14, // Stats window: last 14 days
  topDomainsLimit: 5, // Show top 5 domains for each stat
  leastVisitedLimit: 5, // Show up to 5 least visited domains
  leastVisitedMaxVisits: 10 // Only show domains with <= 10 visits (filter out frequent sites)
};
