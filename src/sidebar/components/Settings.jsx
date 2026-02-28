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
function Settings({ onSave }) {
  const [provider, setProvider] = useState('claude');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [apiKey, setApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState({});
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Ollama connection state
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaChecking, setOllamaChecking] = useState(false);

  // Connection testing state
  const [connectionStatus, setConnectionStatus] = useState({ type: '', text: '' });
  const [testingConnection, setTestingConnection] = useState(false);

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
      { value: 'llama3.1', label: 'Llama 3.1 (Recommended)' },
      { value: 'llama3.2', label: 'Llama 3.2' },
      { value: 'mistral', label: 'Mistral 7B' },
      { value: 'codellama', label: 'Code Llama' },
      { value: 'phi3', label: 'Phi 3 Mini (Fast)' },
      { value: 'gemma2', label: 'Gemma 2' }
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
      if (provider === 'ollama') {
        // For Ollama, check connection first
        checkOllamaConnection();
      } else {
        setModel(models[provider][0].value);
      }
    }
    // Always update API key for the current provider
    setApiKey(apiKeys[provider] || '');
  }, [provider]);

  // Auto-detect Ollama when URL changes (debounced)
  useEffect(() => {
    if (provider === 'ollama' && !isInitialLoad) {
      const timer = setTimeout(() => {
        checkOllamaConnection();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [ollamaUrl]);

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response.success) {
        const data = response.data;
        const selectedProvider = data.selectedProvider || 'claude';
        setProvider(selectedProvider);
        setModel(data.selectedModel || models[selectedProvider][0].value);
        setApiKeys(data.apiKeys || {});
        setOllamaUrl(data.ollamaUrl || 'http://localhost:11434');
        // Set current provider's API key
        setApiKey(data.apiKeys?.[selectedProvider] || '');

        // If Ollama is selected, check connection
        if (selectedProvider === 'ollama') {
          await checkOllamaConnection(data.ollamaUrl || 'http://localhost:11434');
        }

        // Mark initial load as complete
        setIsInitialLoad(false);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  /**
   * Check Ollama connection and fetch available models
   */
  async function checkOllamaConnection(url = ollamaUrl) {
    setOllamaChecking(true);
    setOllamaConnected(false);
    setOllamaModels([]);

    try {
      const response = await fetch(`${url}/api/tags`);
      if (!response.ok) throw new Error('Failed to connect');

      const data = await response.json();
      const models = data.models || [];

      setOllamaModels(models.map(m => ({
        value: m.name,
        label: `${m.name}${m.size ? ` (${formatBytes(m.size)})` : ''}`
      })));
      setOllamaConnected(true);

      // Set first model as default if none selected
      if (models.length > 0 && !model) {
        setModel(models[0].name);
      }
    } catch (error) {
      console.error('Ollama connection failed:', error);
      setOllamaConnected(false);
      setOllamaModels([]);
    } finally {
      setOllamaChecking(false);
    }
  }

  /**
   * Test connection for current provider
   */
  async function testConnection() {
    setTestingConnection(true);
    setConnectionStatus({ type: '', text: '' });

    try {
      if (provider === 'ollama') {
        // Test Ollama connection
        await checkOllamaConnection();
        if (ollamaConnected || ollamaModels.length > 0) {
          setConnectionStatus({
            type: 'success',
            text: `✅ Connected — ${ollamaModels.length} model${ollamaModels.length !== 1 ? 's' : ''} available`
          });
        } else {
          setConnectionStatus({ type: 'error', text: '❌ Connection failed' });
        }
      } else {
        // Test API provider with a simple message
        const testPrompt = 'Hi';
        const response = await chrome.runtime.sendMessage({
          type: 'ASK_AI',
          data: {
            prompt: testPrompt,
            systemPrompt: 'Reply with just "OK"'
          }
        });

        if (response.success) {
          const modelLabel = models[provider].find(m => m.value === model)?.label || model;
          setConnectionStatus({
            type: 'success',
            text: `✅ Connected — ${modelLabel} ready`
          });
        } else {
          setConnectionStatus({
            type: 'error',
            text: response.error?.includes('API key') ? '❌ Invalid API key' : '❌ Connection failed'
          });
        }
      }
    } catch (error) {
      setConnectionStatus({ type: 'error', text: '❌ Connection failed' });
    } finally {
      setTestingConnection(false);
      setTimeout(() => setConnectionStatus({ type: '', text: '' }), 5000);
    }
  }

  /**
   * Format bytes to human-readable size
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
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

        // Notify parent component to re-check configuration
        if (onSave) {
          onSave();
        }
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
      <h2 className="text-2xl font-bold text-owl-primary mb-6">Settings</h2>

      {/* Provider Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          LLM Provider
        </label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-owl-blue"
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

        {provider === 'ollama' && !ollamaConnected ? (
          // Ollama not connected - show error message
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm font-medium text-yellow-900 mb-2">
              ⚠️ Ollama not detected at {ollamaUrl}
            </p>
            <p className="text-xs text-yellow-800 mb-3">
              Make sure Ollama is running
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => checkOllamaConnection()}
                disabled={ollamaChecking}
                className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
              >
                {ollamaChecking ? 'Checking...' : 'Retry connection'}
              </button>
              <a
                href="https://ollama.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-medium text-yellow-900 hover:underline"
              >
                Download Ollama →
              </a>
            </div>
          </div>
        ) : (
          // Normal model dropdown
          <>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-owl-blue"
            >
              {(provider === 'ollama' ? ollamaModels : models[provider]).map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            {/* Ollama connection status */}
            {provider === 'ollama' && ollamaConnected && (
              <p className="mt-2 text-xs text-green-700">
                ✅ Ollama connected — {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} available
              </p>
            )}
          </>
        )}
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
                  : 'border-gray-300 focus:ring-owl-blue'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-owl-blue hover:text-owl-blue/80"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-owl-blue"
          />
          <p className="mt-1 text-xs text-gray-500">
            Make sure Ollama is running at this URL
          </p>
          <p className="mt-2 text-xs text-gray-600">
            Don't have Ollama? <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-owl-blue hover:underline">Download free at ollama.ai</a>
          </p>
        </div>
      )}

      {/* Test Connection Button */}
      <div className="mb-4">
        <button
          onClick={testConnection}
          disabled={testingConnection || (!apiKey && provider !== 'ollama') || (provider === 'ollama' && !ollamaConnected)}
          className={`
            w-full px-4 py-2 rounded-lg font-medium border-2
            ${testingConnection || (!apiKey && provider !== 'ollama') || (provider === 'ollama' && !ollamaConnected)
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-white text-owl-blue border-owl-blue hover:bg-owl-blue/5'
            }
          `}
        >
          {testingConnection ? 'Testing...' : 'Test Connection'}
        </button>

        {/* Connection Status */}
        {connectionStatus.text && (
          <div className={`mt-2 p-3 rounded-lg text-sm ${
            connectionStatus.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {connectionStatus.text}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="mb-6">
        <button
          onClick={handleSave}
          disabled={saving || (!apiKey && provider !== 'ollama') || (provider === 'ollama' && !ollamaConnected)}
          className={`
            w-full px-4 py-2 rounded-lg font-medium
            ${saving || (!apiKey && provider !== 'ollama') || (provider === 'ollama' && !ollamaConnected)
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-owl-blue text-white hover:bg-owl-blue/90'
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
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          {provider === 'ollama' ? '🔒 Maximum Privacy' : 'Privacy First'}
        </h3>
        <ul className="text-xs text-gray-700 space-y-1">
          <li>• All data stored locally in Chrome storage</li>
          {provider === 'ollama' ? (
            <>
              <li>• AI runs entirely on your machine</li>
              <li>• Nothing ever sent to external servers</li>
              <li>• No API costs — completely free to run</li>
            </>
          ) : (
            <li>• Prompts sent only to {provider === 'claude' ? 'Anthropic Claude' : provider === 'openai' ? 'OpenAI' : 'Google Gemini'} API</li>
          )}
          <li>• No analytics, no tracking, no telemetry</li>
          <li>• Open source and auditable</li>
        </ul>
      </div>
    </div>
  );
}

export default Settings;
