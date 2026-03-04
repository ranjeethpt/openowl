export const DEFAULT_SETTINGS = {
  selectedProvider: 'claude',
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
  minActiveTimeMs: 3000, // 5 seconds - catch quick reference visits
  logRetentionDays: 90 // 90 days for better historical context
};
