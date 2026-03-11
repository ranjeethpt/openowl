import React, { useState, useEffect, useRef } from 'react';
import { getAllTemplates } from '../../prompts/templates.js';
import { getPrompt } from '../../prompts/registry.js';
import { useToast } from '../hooks/useToast.jsx';
import { useCopyPrompt } from '../hooks/useCopyPrompt.js';

/**
 * Ask component - AI chat with browser context awareness + templates
 */
function Ask({ messages, onMessagesChange, onNavigateToSettings, isLLMConfigured }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [tabContext, setTabContext] = useState(null);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [todayStats, setTodayStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const loadingTimers = useRef([]);

  // Use unified toast hook
  const { showToast, ToastContainer } = useToast();
  const { copyPromptForTemplate } = useCopyPrompt(showToast);

  // Auto-run if a new message is added with autoRun flag
  const processedAutoRunRef = useRef(null);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage &&
      lastMessage.role === 'user' &&
      lastMessage.autoRun &&
      !loading &&
      processedAutoRunRef.current !== lastMessage.text
    ) {
      // Mark as processed immediately to prevent double run
      processedAutoRunRef.current = lastMessage.text;

      // Trigger AI
      askAI(lastMessage.text);

      // Clean up autoRun flag in state after a tiny delay to allow first render
      // This is still needed to sync back to App.jsx
      setTimeout(() => {
        const updatedMessages = [...messages];
        const lastMsgIndex = updatedMessages.length - 1;
        if (updatedMessages[lastMsgIndex] && updatedMessages[lastMsgIndex].autoRun) {
          updatedMessages[lastMsgIndex] = { ...updatedMessages[lastMsgIndex], autoRun: false };
          onMessagesChange(updatedMessages);
        }
      }, 0);
    }
  }, [messages, loading, onMessagesChange]);

  // Loading message timer
  useEffect(() => {
    if (loading) {
      setLoadingMessage('Reading context...');
      setShowCancel(false);

      loadingTimers.current = [
        setTimeout(() => setLoadingMessage('Thinking...'), 8000),
        setTimeout(() => setShowCancel(true), 10000),
        setTimeout(() => setLoadingMessage('Still thinking... (local models can take 30–60s)'), 20000),
        setTimeout(() => setLoadingMessage('Almost there...'), 45000)
      ];
    } else {
      setLoadingMessage('');
      setShowCancel(false);
      loadingTimers.current.forEach(timer => clearTimeout(timer));
      loadingTimers.current = [];
    }

    return () => {
      loadingTimers.current.forEach(timer => clearTimeout(timer));
      loadingTimers.current = [];
    };
  }, [loading]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load tab context and today stats on mount
  useEffect(() => {
    loadTabContext();
    loadTodayStats();
    loadTemplates();

    // Listen for tab updates from background
    const handleTabUpdate = (message) => {
      if (message.type === 'TABS_CHANGED') {
        loadTabContext();
      }
    };

    chrome.runtime.onMessage.addListener(handleTabUpdate);

    return () => {
      chrome.runtime.onMessage.removeListener(handleTabUpdate);
    };
  }, []);

  /**
   * Load all templates (built-in + custom)
   */
  async function loadTemplates() {
    setTemplatesLoading(true);
    try {
      const allTemplates = await getAllTemplates();
      setTemplates(allTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
      // Fall back to empty array - component will still work
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }

  /**
   * Load current tab context
   */
  async function loadTabContext() {
    setTabsLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_TABS' });
      if (response.success) {
        setTabContext({
          total: response.totalTabs,
          readable: response.readableTabs,
          skipped: response.skippedTabs
        });
      }
    } catch (error) {
      console.error('Error loading tab context:', error);
    } finally {
      setTabsLoading(false);
    }
  }

  /**
   * Load today's stats for context display
   */
  async function loadTodayStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' });
      if (response.success) {
        setTodayStats(response.data);
      }
    } catch (error) {
      console.error('Error loading today stats:', error);
    }
  }

  /**
   * Convert API errors to user-friendly messages
   */
  function getUserFriendlyError(errorMessage) {
    const errorLower = errorMessage.toLowerCase();

    // Claude API errors
    if (errorLower.includes('authentication_error') || errorLower.includes('invalid x-api-key')) {
      return 'Invalid Claude API key. Please check your API key in Settings.';
    }
    if (errorLower.includes('401') && errorLower.includes('claude')) {
      return 'Claude API authentication failed. Please verify your API key in Settings.';
    }

    // Ollama connection errors
    if (errorLower.includes('err_connection_refused') || errorLower.includes('failed to fetch')) {
      return 'Cannot connect to Ollama. Make sure Ollama is running locally (http://localhost:11434).';
    }
    if (errorLower.includes('econnrefused')) {
      return 'Connection refused. If using Ollama, make sure it is running. Check Settings for provider configuration.';
    }

    // OpenAI/Gemini API errors
    if (errorLower.includes('openai') && (errorLower.includes('401') || errorLower.includes('authentication'))) {
      return 'Invalid OpenAI API key. Please check your API key in Settings.';
    }
    if (errorLower.includes('gemini') && (errorLower.includes('401') || errorLower.includes('api key not valid'))) {
      return 'Invalid Gemini API key. Please check your API key in Settings.';
    }

    // Generic API key errors
    if (errorLower.includes('api key') || errorLower.includes('apikey')) {
      return 'API key issue detected. Please verify your API key in Settings.';
    }

    // Rate limit errors
    if (errorLower.includes('rate limit') || errorLower.includes('429')) {
      return 'Rate limit exceeded. Please wait a moment and try again, or check your API plan in Settings.';
    }

    // Network errors
    if (errorLower.includes('network') || errorLower.includes('fetch')) {
      return 'Network error. Check your internet connection and provider settings.';
    }

    // Default: return original message if no pattern matches
    return errorMessage;
  }

  /**
   * Send question to AI
   */
  async function askAI(question) {
    if (!question.trim()) return;

    // If LLM not configured, show helper message instead of calling API
    if (!isLLMConfigured) {
      // Add user message
      const userMessage = { role: 'user', text: question };
      onMessagesChange(prev => [...prev, userMessage]);

      // Add system message explaining configuration needed
      const systemMessage = {
        role: 'assistant',
        text: 'LLM not configured',
        isConfigPrompt: true
      };
      onMessagesChange(prev => [...prev, systemMessage]);
      return;
    }

    // Add user message if not already there (autoRun case adds it first)
    const lastMessage = messages[messages.length - 1];
    let currentMessages = messages;
    if (!lastMessage || lastMessage.text !== question || lastMessage.role !== 'user') {
      currentMessages = [...messages, { role: 'user', text: question }];
      onMessagesChange(currentMessages);
    }

    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ASK_AI',
        data: {
          question,
          messages: currentMessages // ← multi-turn history
        }
      });

      if (response.success) {
        const aiMessage = {
          role: 'assistant',
          text: response.data.text,
          context: response.data.context,
          templateUsed: response.data.templateUsed
        };
        onMessagesChange(prev => [...prev, aiMessage]);
      } else {
        throw new Error(response.error || 'Failed to get response');
      }
    } catch (error) {
      console.error('Error asking AI:', error);

      // Convert to user-friendly error message
      const friendlyError = getUserFriendlyError(error.message);
      setError(friendlyError);

      // Show error message in chat
      onMessagesChange(prev => [...prev, {
        role: 'error',
        text: friendlyError
      }]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Cancel current request
   */
  function cancelRequest() {
    setLoading(false);
    setLoadingMessage('');
    setShowCancel(false);
    loadingTimers.current.forEach(timer => clearTimeout(timer));
    loadingTimers.current = [];
    onMessagesChange(prev => [...prev, {
      role: 'error',
      text: 'Request cancelled'
    }]);
  }


  /**
   * Copy prompt to clipboard for manual paste into ChatGPT/Gemini
   */
  async function handleCopyPrompt(template) {
    await copyPromptForTemplate(template);
  }

  /**
   * Handle quick action button click
   */
  /**
   * Handle template click with clearing strategy
   */
  function handleTemplateClick(template) {
    // Don't allow running templates without API key
    if (!isLLMConfigured) {
      showToast('Add API key in Settings to send directly', true);
      return;
    }

    if (template.type === 'auto') {
      // Clear messages FIRST → fresh context
      onMessagesChange([]);
      // Then run template
      // For custom templates, use userInstructions if provided, otherwise use a default prompt
      let userPrompt = template.label;
      if (template.isCustom) {
        const instructions = template.promptConfig?.userInstructions?.trim();
        userPrompt = instructions || 'Summarize this activity';
      }
      askAI(userPrompt);
      return;
    }

    if (template.type === 'prompt') {
      // DO NOT clear messages - user might be following up
      // Prefill input, let user complete
      const prefillText = template.prefill || '';
      setInput(prefillText);
      textareaRef.current?.focus();
      // Move cursor to end
      setTimeout(() => {
        if (textareaRef.current) {
          const len = prefillText.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 0);
    }
  }

  /**
   * Handle Enter key (Shift+Enter for new line)
   */
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askAI(input);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ overflow: 'hidden' }}>
      {/* API Key Banner - only show when not configured */}
      {!isLLMConfigured && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-amber-800">
            LLM not configured. Responses will not work yet.
          </span>
          <button
            onClick={onNavigateToSettings}
            className="text-xs text-amber-700 hover:text-amber-800 font-medium underline"
          >
            Go to Settings
          </button>
        </div>
      )}

      {/* Context Info */}
      <div className="px-4 py-2 bg-slate-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {tabContext && todayStats && (
            <span className="text-xs text-gray-600">
              {tabsLoading ? '⟳ updating...' : (
                <>
                  📚 {tabContext.readable} tabs · 📅 {todayStats.totalVisits} history · ⏱ {Math.round(todayStats.totalActiveTime / 60000)}m
                </>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={() => onMessagesChange([])}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors flex items-center gap-1"
              title="Clear chat"
            >
              <span>🗑️</span>
              <span>Clear</span>
            </button>
          )}
          <button
            onClick={loadTabContext}
            disabled={tabsLoading}
            className="text-gray-400 hover:text-owl-blue transition-colors disabled:opacity-50"
            title="Refresh tab context"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {/* Template Buttons - Only show when no messages */}
        {messages.length === 0 && !templatesLoading && (
          <div className="px-4 py-3 border-b border-gray-200">
            {/* AUTO templates - run immediately (built-in only) */}
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">
              Quick actions
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {templates
                .filter(t => t.type === 'auto' && !t.isCustom)
                .map(t => (
                  <div key={t.label} className="flex flex-col gap-1">
                    <button
                      onClick={() => handleTemplateClick(t)}
                      disabled={!isLLMConfigured}
                      className={`px-3 py-1.5 text-sm rounded transition-colors ${
                        isLLMConfigured
                          ? 'bg-gray-100 hover:bg-owl-blue/10 text-gray-700'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                      title={!isLLMConfigured ? 'Add API key to use' : ''}
                    >
                      {t.label}
                    </button>
                    {t.copyable && (
                      <button
                        onClick={() => handleCopyPrompt(t)}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded font-medium transition-colors"
                      >
                        📋 Copy prompt
                      </button>
                    )}
                  </div>
                ))}
            </div>

            {/* PROMPT templates - prefill input (built-in only) */}
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">
              Search memory
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {templates
                .filter(t => t.type === 'prompt' && !t.isCustom)
                .map(t => (
                  <button
                    key={t.label}
                    onClick={() => handleTemplateClick(t)}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-owl-blue/10 text-sm text-owl-blue border border-owl-blue/20 rounded transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
            </div>

            {/* CUSTOM templates - separate group */}
            {templates.filter(t => t.isCustom).length > 0 && (
              <>
                <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">
                  My Templates
                </p>
                <div className="flex flex-wrap gap-2">
                  {templates
                    .filter(t => t.isCustom)
                    .map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleTemplateClick(t)}
                        className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-sm text-purple-700 border border-purple-200 rounded transition-colors flex items-center gap-1 group"
                      >
                        <span>{t.label}</span>
                        <span className="opacity-0 group-hover:opacity-100 text-xs">✏️</span>
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {templatesLoading && messages.length === 0 && (
          <div className="px-4 py-3 text-center text-gray-500 text-sm">
            Loading templates...
          </div>
        )}

        <div className="p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-12">
              <p className="text-lg font-medium text-owl-primary mb-2">Ask about your browser context</p>
              <p className="text-sm text-gray-600">Questions across all your open tabs and work history</p>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {error}
                <div className="mt-2">
                  <button onClick={onNavigateToSettings} className="text-red-600 hover:text-red-700 underline">
                    Go to Settings →
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-owl-blue text-white'
                      : msg.role === 'error'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}
                >
                  {/* Config prompt message - special handling */}
                  {msg.isConfigPrompt ? (
                    <div className="text-sm">
                      <div className="font-semibold text-gray-900 mb-2">LLM not configured</div>
                      <p className="text-gray-700 mb-3 leading-relaxed">
                        To get responses here, add an API key in Settings.
                      </p>
                      <p className="text-gray-700 mb-3 leading-relaxed">
                        If you prefer, use <span className="font-semibold">Copy prompt</span> on any template button
                        to build your prompt with real data and paste it into ChatGPT, Gemini, or Claude.ai.
                      </p>
                      <button
                        onClick={onNavigateToSettings}
                        className="px-3 py-1.5 bg-owl-blue text-white text-xs font-medium rounded hover:bg-owl-blue/90 transition-colors"
                      >
                        Go to Settings →
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
                  )}

                  {/* Settings link for error messages */}
                  {msg.role === 'error' && (
                    <div className="mt-2 pt-2 border-t border-red-200">
                      <button
                        onClick={onNavigateToSettings}
                        className="text-xs text-red-600 hover:text-red-700 underline"
                      >
                        Go to Settings →
                      </button>
                    </div>
                  )}

                  {/* Token count for AI messages */}
                  {msg.role === 'assistant' && msg.context?.tokensUsed && (
                    <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                      {msg.context.usage?.estimated ? '~' : ''}{msg.context.tokensUsed.toLocaleString()} tokens
                      {msg.context.usage && !msg.context.usage.estimated && (
                        <span className="ml-1 text-gray-400" title="Actual tokens from API">✓</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 px-4 py-3 rounded-lg flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-owl-blue rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-owl-blue rounded-full animate-bounce delay-75"></div>
                      <div className="w-2 h-2 bg-owl-blue rounded-full animate-bounce delay-150"></div>
                      <span className="text-sm text-gray-500 ml-1">
                        {loadingMessage || 'Thinking...'}
                      </span>
                    </div>
                    {loadingMessage && loadingMessage.includes('Thinking') && (
                      <div className="text-[10px] text-gray-400 italic">
                        Local models can be slow on CPU
                      </div>
                    )}
                  </div>
                </div>
                {/* Cancel button appears after 10 seconds of thinking */}
                {showCancel && (
                  <div className="flex justify-start px-2">
                    <button
                      onClick={cancelRequest}
                      className="text-xs text-red-400 hover:text-red-500 transition-colors flex items-center gap-1"
                    >
                      <span>✕</span>
                      <span>Cancel</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4 flex-shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question... (Enter to send, Shift+Enter for new line)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-owl-blue"
          rows={3}
          disabled={loading}
        />
        <button
          className={`mt-2 px-4 py-2 rounded-lg w-full font-medium transition-colors flex items-center justify-center gap-2 ${
            !isLLMConfigured
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : loading || !input.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-owl-blue text-white hover:bg-owl-blue/90'
          }`}
          onClick={() => {
            if (isLLMConfigured) {
              askAI(input);
            } else {
              showToast('Add API key in Settings to send directly', true);
            }
          }}
          disabled={!isLLMConfigured || loading || !input.trim()}
          title={!isLLMConfigured ? 'Add API key in Settings to send directly' : ''}
        >
          {loading ? (
            'Thinking...'
          ) : (
            <>
              {!isLLMConfigured && <span className="text-lg">🔒</span>}
              <span>Ask</span>
            </>
          )}
        </button>
        {!isLLMConfigured && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            💡 Use <span className="font-semibold">Copy prompt</span> on quick actions to paste into any AI chat
          </p>
        )}
      </div>

      {/* Toast notification */}
      <ToastContainer />
    </div>
  );
}

export default Ask;
