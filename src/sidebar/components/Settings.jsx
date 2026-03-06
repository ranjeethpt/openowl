import React, { useState, useEffect } from 'react';
import Preferences from './Preferences';
import HistoryImportStatus from './HistoryImportStatus';
import { PROVIDERS, PROVIDER_NAMES } from '../../constants.js';

/**
 * API key configuration for each provider
 * Single source of truth for patterns, placeholders, and format hints
 */
const API_KEY_CONFIG = {
  [PROVIDERS.CLAUDE]: {
    pattern: /^sk-ant-api03-/,
    placeholder: 'sk-ant-api03-...',
    format: 'Starts with sk-ant-api03-'
  },
  [PROVIDERS.OPENAI]: {
    pattern: /^sk-/,
    placeholder: 'sk-proj-...',
    format: 'Starts with sk-proj- or sk-'
  },
  [PROVIDERS.GEMINI]: {
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
  const [provider, setProvider] = useState(PROVIDERS.CLAUDE);
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

  // Welcome banner state
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  // Custom Templates state
  const [customTemplates, setCustomTemplates] = useState([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    icon: '📋',
    type: 'auto',
    timeRange: 'last_7_days',
    domains: [],
    source: 'both',
    includeTabs: false,
    minActiveMinutes: 0,
    userInstructions: '',
    outputFormat: 'bullets'
  });
  const [domainInput, setDomainInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Model options for each provider
  const models = {
    [PROVIDERS.CLAUDE]: [
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (latest)' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (fast)' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' }
    ],
    [PROVIDERS.OPENAI]: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ],
    [PROVIDERS.GEMINI]: [
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' }
    ],
    [PROVIDERS.OLLAMA]: [
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
      if (provider === PROVIDERS.OLLAMA) {
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
    if (provider === PROVIDERS.OLLAMA && !isInitialLoad) {
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

      // Load welcome banner state
      const welcomeResult = await chrome.storage.local.get('welcomeDismissed');
      setWelcomeDismissed(welcomeResult.welcomeDismissed || false);

      // Load custom templates
      const templatesResult = await chrome.storage.local.get('customTemplates');
      setCustomTemplates(templatesResult.customTemplates || []);
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
      if (provider === PROVIDERS.OLLAMA) {
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
            systemPrompt: 'Reply with just "OK"',
            provider: provider,
            model: model,
            apiKey: apiKey,
            ollamaUrl: ollamaUrl,
            includeContext: false // Don't build context for connection test
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

  async function dismissWelcome() {
    try {
      await chrome.storage.local.set({ welcomeDismissed: true });
      setWelcomeDismissed(true);
    } catch (error) {
      console.error('Error dismissing welcome banner:', error);
    }
  }

  // Custom Template handlers
  function openTemplateForm(template = null) {
    if (template) {
      // Editing existing template
      setEditingTemplate(template);
      setTemplateForm({
        name: template.name,
        icon: template.icon || '📋',
        type: template.type || 'auto',
        timeRange: template.filters?.timeRange?.type === 'last_n_days'
          ? `last_${template.filters.timeRange.n}_days`
          : template.filters?.timeRange?.type || 'last_7_days',
        domains: template.filters?.domains || [],
        source: template.filters?.source || 'both',
        includeTabs: template.filters?.includeTabs || false,
        minActiveMinutes: template.filters?.minActiveMinutes || 0,
        userInstructions: template.userInstructions || '',
        outputFormat: template.outputFormat || 'bullets'
      });
    } else {
      // Creating new template
      setEditingTemplate(null);
      setTemplateForm({
        name: '',
        icon: '📋',
        type: 'auto',
        timeRange: 'last_7_days',
        domains: [],
        source: 'both',
        includeTabs: false,
        minActiveMinutes: 0,
        userInstructions: '',
        outputFormat: 'bullets'
      });
    }
    setShowTemplateForm(true);
  }

  function closeTemplateForm() {
    setShowTemplateForm(false);
    setEditingTemplate(null);
    setDomainInput('');
  }

  function addDomain() {
    const domain = domainInput.trim().toLowerCase();
    if (!domain) return;

    // Warn if no dot
    if (!domain.includes('.')) {
      // Just a warning, still allow
    }

    // Check limit
    if (templateForm.domains.length >= 10) {
      return; // Block
    }

    // Add if not duplicate
    if (!templateForm.domains.includes(domain)) {
      setTemplateForm({
        ...templateForm,
        domains: [...templateForm.domains, domain]
      });
    }
    setDomainInput('');
  }

  function removeDomain(domain) {
    setTemplateForm({
      ...templateForm,
      domains: templateForm.domains.filter(d => d !== domain)
    });
  }

  async function saveTemplate() {
    // Validate name
    const name = templateForm.name.trim();
    if (!name || name.length > 50) return;

    // Build time range object
    let timeRangeObj = { type: templateForm.timeRange };
    if (templateForm.timeRange.startsWith('last_') && templateForm.timeRange.endsWith('_days')) {
      const n = parseInt(templateForm.timeRange.split('_')[1]);
      timeRangeObj = { type: 'last_n_days', n };
    }

    const template = {
      ...(editingTemplate || {}),
      name,
      icon: templateForm.icon || '📋',
      type: templateForm.type,
      userInstructions: templateForm.userInstructions,
      outputFormat: templateForm.outputFormat,
      filters: {
        timeRange: timeRangeObj,
        domains: templateForm.domains,
        source: templateForm.source,
        includeTabs: templateForm.includeTabs,
        minActiveMinutes: Math.max(0, templateForm.minActiveMinutes),
        minVisitCount: 1
      }
    };

    try {
      const updated = editingTemplate
        ? customTemplates.map(t => t.id === editingTemplate.id ? { ...template, id: editingTemplate.id } : t)
        : [...customTemplates, { ...template, id: crypto.randomUUID(), createdAt: Date.now() }];

      await chrome.storage.local.set({ customTemplates: updated });
      setCustomTemplates(updated);
      closeTemplateForm();
    } catch (error) {
      console.error('Error saving template:', error);
    }
  }

  async function deleteTemplate(id) {
    try {
      const updated = customTemplates.filter(t => t.id !== id);
      await chrome.storage.local.set({ customTemplates: updated });
      setCustomTemplates(updated);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting template:', error);
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
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-owl-primary mb-6">Settings</h2>

      {/* Welcome Banner */}
      {!welcomeDismissed && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg relative">
          <button
            onClick={dismissWelcome}
            className="absolute top-2 right-2 text-blue-400 hover:text-blue-600 text-sm"
          >
            ✕
          </button>
          <div className="flex items-start gap-3">
            <img
              src="/icons/icon48.png"
              alt="OpenOwl"
              className="w-12 h-12 flex-shrink-0"
            />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                Welcome to OpenOwl
              </h3>
              <p className="text-sm text-blue-800">
                OpenOwl watches what you work on and helps you write standups, find things you researched, and understand where your time goes. Your data stays in your control.
              </p>
            </div>
          </div>
        </div>
      )}

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
          <option value={PROVIDERS.CLAUDE}>{PROVIDER_NAMES[PROVIDERS.CLAUDE]}</option>
          <option value={PROVIDERS.OPENAI}>{PROVIDER_NAMES[PROVIDERS.OPENAI]}</option>
          <option value={PROVIDERS.GEMINI}>{PROVIDER_NAMES[PROVIDERS.GEMINI]}</option>
          <option value={PROVIDERS.OLLAMA}>{PROVIDER_NAMES[PROVIDERS.OLLAMA]} (Local)</option>
        </select>
      </div>

      {/* Model Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Model
        </label>

        {provider === PROVIDERS.OLLAMA && !ollamaConnected ? (
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
              {(provider === PROVIDERS.OLLAMA ? ollamaModels : models[provider]).map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            {/* Ollama connection status */}
            {provider === PROVIDERS.OLLAMA && ollamaConnected && (
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
      {provider === PROVIDERS.OLLAMA && (
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
          <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
            <p className="font-semibold mb-1">Getting a 403 error?</p>
            <p className="mb-1">Restart Ollama with CORS allowed for the extension:</p>
            <code className="block bg-blue-100 p-1 rounded font-mono text-[10px]">
              OLLAMA_ORIGINS="chrome-extension://*" ollama serve
            </code>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Don't have Ollama? <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-owl-blue hover:underline">Download free at ollama.ai</a>
          </p>
        </div>
      )}

      {/* Test Connection Button */}
      <div className="mb-4">
        <button
          onClick={testConnection}
          disabled={testingConnection || (!apiKey && provider !== PROVIDERS.OLLAMA) || (provider === PROVIDERS.OLLAMA && !ollamaConnected)}
          className={`
            w-full px-4 py-2 rounded-lg font-medium border-2
            ${testingConnection || (!apiKey && provider !== PROVIDERS.OLLAMA) || (provider === PROVIDERS.OLLAMA && !ollamaConnected)
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
          disabled={saving || (!apiKey && provider !== PROVIDERS.OLLAMA) || (provider === PROVIDERS.OLLAMA && !ollamaConnected)}
          className={`
            w-full px-4 py-2 rounded-lg font-medium
            ${saving || (!apiKey && provider !== PROVIDERS.OLLAMA) || (provider === PROVIDERS.OLLAMA && !ollamaConnected)
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

      {/* Preferences Section */}
      <Preferences />

      {/* History Import Context */}
      <div className="mt-8 mb-4">
        <p className="text-xs text-gray-500 mb-1">
          Your last 30 days were imported so standup works from day one.
        </p>
        <p className="text-xs text-gray-500">
          OpenOwl gets richer as it captures your live browsing over time.
        </p>
      </div>

      {/* History Import Status */}
      <HistoryImportStatus />

      {/* Custom Templates Accordion */}
      <details className="mt-8 border border-gray-200 rounded-lg overflow-hidden">
        <summary className="px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 font-medium text-gray-900 flex items-center justify-between">
          <span>📋 Custom Templates</span>
          <span className="text-gray-400 text-sm">▼</span>
        </summary>

        <div className="p-4 bg-white">
          {customTemplates.length === 0 ? (
            /* Empty State */
            <div>
              <p className="text-sm text-gray-600 mb-3">Already in your Ask tab</p>
              <div className="text-xs text-gray-600 space-y-1 mb-4">
                <div>✍️ Write standup — daily update for your team</div>
                <div>📊 Day summary — what you worked on today</div>
                <div>🎯 What to focus on — priority based on open tabs</div>
                <div>📅 Week wrap — end of week summary</div>
                <div>🔍 Remind me of — search your work history</div>
                <div>📅 Prep for — context for an upcoming meeting</div>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Once you find yourself repeating a specific lookup, come back and create a template for it.
              </p>
              <button
                onClick={() => openTemplateForm()}
                className="px-4 py-2 bg-owl-blue text-white rounded hover:bg-owl-blue/90 text-sm"
              >
                Create template
              </button>
            </div>
          ) : (
            /* Has Templates State */
            <div>
              <div className="space-y-2 mb-4">
                {customTemplates.map(template => (
                  <div key={template.id} className="flex items-center justify-between p-3 border border-gray-200 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{template.icon}</span>
                      <span className="text-sm font-medium text-gray-900">{template.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openTemplateForm(template)}
                        className="text-xs text-owl-blue hover:underline"
                      >
                        Edit
                      </button>
                      {deleteConfirm === template.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">Delete {template.name}?</span>
                          <button
                            onClick={() => deleteTemplate(template.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-xs text-gray-600 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(template.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => openTemplateForm()}
                className="px-4 py-2 bg-owl-blue text-white rounded hover:bg-owl-blue/90 text-sm"
              >
                Create template
              </button>
            </div>
          )}

          {/* Template Builder Form */}
          {showTemplateForm && (
            <div className="mt-6 p-4 border border-gray-300 rounded-lg bg-gray-50">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </h4>

              {/* Name */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="My custom template"
                  maxLength={50}
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-owl-blue"
                />
                {templateForm.name.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">Name is required</p>
                )}
                {templateForm.name.length > 40 && (
                  <p className="text-xs text-gray-500 mt-1">{templateForm.name.length}/50 characters</p>
                )}
              </div>

              {/* Icon */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Icon</label>
                <div className="grid grid-cols-6 gap-2 mb-2">
                  {['📋','📊','🎯','🔍','🎫','📅','⚡','🔧','📝','💡','🚀','🏃','✅','🐛','💬','📌','🔖','⭐'].map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setTemplateForm({ ...templateForm, icon: emoji })}
                      className={`p-2 text-lg rounded border ${
                        templateForm.icon === emoji
                          ? 'border-owl-blue bg-owl-blue/10'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={templateForm.icon}
                  onChange={(e) => setTemplateForm({ ...templateForm, icon: e.target.value.substring(0, 2) })}
                  placeholder="📋"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>

              {/* Type */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="auto"
                      checked={templateForm.type === 'auto'}
                      onChange={(e) => setTemplateForm({ ...templateForm, type: e.target.value })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Runs immediately when clicked</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="prompt"
                      checked={templateForm.type === 'prompt'}
                      onChange={(e) => setTemplateForm({ ...templateForm, type: e.target.value })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Prefills input field, you complete it</span>
                  </label>
                </div>
              </div>

              {/* Time Range */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Time range</label>
                <select
                  value={templateForm.timeRange}
                  onChange={(e) => setTemplateForm({ ...templateForm, timeRange: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last_7_days">Last 7 days</option>
                  <option value="last_14_days">Last 14 days</option>
                  <option value="last_30_days">Last 30 days</option>
                  <option value="this_week">This week</option>
                  <option value="last_week">Last week</option>
                </select>
              </div>

              {/* Domains */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Domains (optional)</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDomain();
                      }
                    }}
                    placeholder="e.g. github.com"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                  <button
                    onClick={addDomain}
                    disabled={templateForm.domains.length >= 10}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                {templateForm.domains.length >= 10 && (
                  <p className="text-xs text-red-600 mb-2">Maximum 10 domains per template</p>
                )}
                {domainInput && !domainInput.includes('.') && (
                  <p className="text-xs text-yellow-600 mb-2">Use full domain e.g. github.com not github</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {templateForm.domains.map(domain => (
                    <span key={domain} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">
                      {domain}
                      <button
                        onClick={() => removeDomain(domain)}
                        className="text-gray-500 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Source */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Source</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="both"
                      checked={templateForm.source === 'both'}
                      onChange={(e) => setTemplateForm({ ...templateForm, source: e.target.value })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Both</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="live"
                      checked={templateForm.source === 'live'}
                      onChange={(e) => setTemplateForm({ ...templateForm, source: e.target.value })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Live only</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="history"
                      checked={templateForm.source === 'history'}
                      onChange={(e) => setTemplateForm({ ...templateForm, source: e.target.value })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">History only</span>
                  </label>
                </div>
              </div>

              {/* Include Tabs */}
              <div className="mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={templateForm.includeTabs}
                    onChange={(e) => setTemplateForm({ ...templateForm, includeTabs: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Include currently open tabs as context</span>
                </label>
              </div>

              {/* Min Active Time */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Min active time (minutes)</label>
                <input
                  type="number"
                  min="0"
                  value={templateForm.minActiveMinutes}
                  onChange={(e) => setTemplateForm({ ...templateForm, minActiveMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
                {templateForm.minActiveMinutes > 480 && (
                  <p className="text-xs text-yellow-600 mt-1">This may return very few results</p>
                )}
              </div>

              {/* Additional Instructions */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Additional instructions (optional)</label>
                <textarea
                  value={templateForm.userInstructions}
                  onChange={(e) => setTemplateForm({ ...templateForm, userInstructions: e.target.value })}
                  placeholder="Leave blank for a general activity summary. Add specifics like: group by ticket ID, ignore emails, highlight anything visited 5 or more times."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
                {templateForm.userInstructions.length > 400 && (
                  <p className="text-xs text-gray-500 mt-1">{templateForm.userInstructions.length} characters</p>
                )}
                {templateForm.userInstructions.length > 500 && (
                  <p className="text-xs text-yellow-600 mt-1">Long instructions may reduce response quality</p>
                )}
              </div>

              {/* Output Format */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Output format</label>
                <select
                  value={templateForm.outputFormat}
                  onChange={(e) => setTemplateForm({ ...templateForm, outputFormat: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="bullets">Bullets</option>
                  <option value="prose">Prose</option>
                  <option value="slack">Slack format</option>
                </select>
              </div>

              {/* Form Actions */}
              <div className="flex gap-2">
                <button
                  onClick={saveTemplate}
                  disabled={!templateForm.name.trim() || templateForm.name.length > 50}
                  className="px-4 py-2 bg-owl-blue text-white rounded text-sm hover:bg-owl-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingTemplate ? 'Save changes' : 'Create'}
                </button>
                <button
                  onClick={closeTemplateForm}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </details>

      {/* Privacy Notice */}
      <div className="mt-8 p-4 bg-gray-100 border border-gray-200 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          {provider === PROVIDERS.OLLAMA ? '🔒 Maximum Privacy' : 'Data & Privacy'}
        </h3>
        <ul className="text-xs text-gray-700 space-y-1">
          <li>• Your browsing activity stored locally on this device</li>
          {provider === PROVIDERS.OLLAMA ? (
            <>
              <li>• AI runs entirely on your machine</li>
              <li>• Nothing ever sent to external servers</li>
              <li>• No API costs — completely free to run</li>
            </>
          ) : (
            <li>• Only your questions and relevant page context
              are sent to {PROVIDER_NAMES[provider] || provider} to generate answers</li>
          )}
          <li>• No data sent to OpenOwl or any third party</li>
          <li>• No analytics, no tracking, no telemetry</li>
          <li>• Open source and auditable</li>
        </ul>
      </div>
      </div>
    </div>
  );
}

export default Settings;
