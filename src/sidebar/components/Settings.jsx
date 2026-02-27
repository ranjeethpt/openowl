import React, { useState, useEffect } from 'react';

/**
 * API key configuration for each provider
 * Single source of truth for patterns, placeholders, and format hints
 */
const API_KEY_CONFIG = {
  claude: {
    pattern: /^sk-ant-api03-/,
    placeholder: 'sk-ant-api03-...',
    format: 'Starts with sk-ant-api03-'
  },
  openai: {
    pattern: /^sk-/,
    placeholder: 'sk-proj-...',
    format: 'Starts with sk-proj- or sk-'
  },
  gemini: {
    pattern: /^AIza/,
    placeholder: 'AIza...',
    format: 'Starts with AIza'
  }
};

/**
 * Get API key placeholder based on provider
 */
function getApiKeyPlaceholder(provider) {
  return API_KEY_CONFIG[provider]?.placeholder || 'Enter your API key';
}

/**
 * Get API key format hint based on provider
 */
function getApiKeyFormat(provider) {
  return API_KEY_CONFIG[provider]?.format || 'Check your provider documentation';
}

/**
 * Validate API key format
 */
function validateApiKey(provider, key) {
  if (!key) return true; // Empty is ok (not yet entered)

  const config = API_KEY_CONFIG[provider];
  return !config?.pattern || config.pattern.test(key);
}

/**
 * Settings component - API key management
 */
function Settings() {
  const [provider, setProvider] = useState('claude');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [apiKey, setApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState({});
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Model options for each provider
  const models = {
    claude: [
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (latest)' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (fast)' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' }
    ],
    openai: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ],
    gemini: [
      { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' }
    ],
    ollama: [
      { value: 'llama2', label: 'Llama 2' },
      { value: 'mistral', label: 'Mistral' },
      { value: 'codellama', label: 'Code Llama' },
      { value: 'phi', label: 'Phi' }
    ]
  };

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // When provider changes, update model to first option (but not on initial load)
  useEffect(() => {
    if (!isInitialLoad) {
      // User manually changed provider - set to first model for that provider
      setModel(models[provider][0].value);
    }
    // Always update API key for the current provider
    setApiKey(apiKeys[provider] || '');
  }, [provider]);

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response.success) {
        const data = response.data;
        setProvider(data.selectedProvider || 'claude');
        setModel(data.selectedModel || models[data.selectedProvider || 'claude'][0].value);
        setApiKeys(data.apiKeys || {});
        setOllamaUrl(data.ollamaUrl || 'http://localhost:11434');
        // Set current provider's API key
        setApiKey(data.apiKeys?.[data.selectedProvider || 'claude'] || '');
        // Mark initial load as complete
        setIsInitialLoad(false);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        data: {
          selectedProvider: provider,
          selectedModel: model,
          apiKeys: {
            ...apiKeys,
            [provider]: apiKey
          },
          ollamaUrl: ollamaUrl
        }
      });

      if (response.success) {
        // Update local apiKeys state
        setApiKeys({ ...apiKeys, [provider]: apiKey });
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>

      {/* Provider Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          LLM Provider
        </label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="claude">Anthropic Claude</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Google Gemini</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
      </div>

      {/* Model Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Model
        </label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {models[provider].map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* API Key (not needed for Ollama) */}
      {provider !== 'ollama' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={getApiKeyPlaceholder(provider)}
              className={`w-full px-3 py-2 pr-20 border rounded-lg focus:outline-none focus:ring-2 ${
                apiKey && !validateApiKey(provider, apiKey)
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-blue-600 hover:text-blue-800"
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>
          {apiKey && !validateApiKey(provider, apiKey) ? (
            <p className="mt-1 text-xs text-red-600">
              ⚠ Key format may be incorrect. Expected format: {getApiKeyFormat(provider)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              Format: {getApiKeyFormat(provider)}
            </p>
          )}
        </div>
      )}

      {/* Ollama URL */}
      {provider === 'ollama' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ollama URL
          </label>
          <input
            type="text"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Make sure Ollama is running at this URL
          </p>
        </div>
      )}

      {/* Save Button */}
      <div className="mb-6">
        <button
          onClick={handleSave}
          disabled={saving || (!apiKey && provider !== 'ollama')}
          className={`
            w-full px-4 py-2 rounded-lg font-medium
            ${saving || (!apiKey && provider !== 'ollama')
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
            }
          `}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Message */}
      {message.text && (
        <div
          className={`
            p-4 rounded-lg
            ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : ''}
            ${message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : ''}
          `}
        >
          {message.text}
        </div>
      )}

      {/* Privacy Notice */}
      <div className="mt-8 p-4 bg-gray-100 border border-gray-200 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Privacy First</h3>
        <ul className="text-xs text-gray-700 space-y-1">
          <li>• All data stored locally in Chrome storage and IndexedDB</li>
          <li>• No data sent to any server except your chosen LLM provider</li>
          <li>• No analytics, no tracking, no telemetry</li>
          <li>• Open source and auditable</li>
        </ul>
      </div>
    </div>
  );
}

export default Settings;
