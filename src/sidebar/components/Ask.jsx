import React, { useState, useEffect, useRef } from 'react';
import { getAllTemplates } from '../../prompts/templates.js';

/**
 * Ask component - AI chat with browser context awareness + templates
 */
function Ask({ messages, onMessagesChange }) {
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
   * Send question to AI
   */
  async function askAI(question) {
    if (!question.trim()) return;

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
      setError(error.message);

      // Show error message in chat
      onMessagesChange(prev => [...prev, {
        role: 'error',
        text: `Error: ${error.message}`
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
   * Handle quick action button click
   */
  /**
   * Handle template click with clearing strategy
   */
  function handleTemplateClick(template) {
    if (template.type === 'auto') {
      // Clear messages FIRST → fresh context
      onMessagesChange([]);
      // Then run template
      askAI(template.label);
      return;
    }

    if (template.type === 'prompt') {
      // DO NOT clear messages - user might be following up
      // Prefill input, let user complete
      setInput(template.prefill);
      textareaRef.current?.focus();
      // Move cursor to end
      setTimeout(() => {
        if (textareaRef.current) {
          const len = template.prefill.length;
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
                  <button
                    key={t.label}
                    onClick={() => handleTemplateClick(t)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-owl-blue/10 text-sm text-gray-700 rounded transition-colors"
                  >
                    {t.label}
                  </button>
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
                {error.includes('API key') && (
                  <div className="mt-2">
                    <a href="#" onClick={() => window.location.hash = '#settings'} className="text-red-600 underline">
                      Go to Settings →
                    </a>
                  </div>
                )}
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
                  <div className="text-sm whitespace-pre-wrap">{msg.text}</div>

                  {/* Context Info for AI messages */}
                  {msg.role === 'assistant' && msg.context && (
                    <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                      Used {msg.context.tabsUsed} of {msg.context.totalTabs} tabs · {msg.context.historyEntries || 0} history entries · ~{msg.context.estimatedTokens} tokens
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
          className={`mt-2 px-4 py-2 rounded-lg w-full font-medium transition-colors ${
            loading || !input.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-owl-blue text-white hover:bg-owl-blue/90'
          }`}
          onClick={() => askAI(input)}
          disabled={loading || !input.trim()}
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </div>
    </div>
  );
}

export default Ask;
