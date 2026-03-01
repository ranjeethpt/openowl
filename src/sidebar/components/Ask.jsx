import React, { useState, useEffect, useRef } from 'react';

/**
 * Ask component - AI chat with browser context awareness
 */
function Ask() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tabContext, setTabContext] = useState(null);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load tab context on mount and listen for tab changes
  useEffect(() => {
    loadTabContext();

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
   * Send question to AI
   */
  async function askAI(question) {
    if (!question.trim()) return;

    // Add user message
    const userMessage = { role: 'user', text: question };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    // Background already reads fresh tabs when ASK_AI is called
    // No need to pre-load separately

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ASK_AI',
        data: {
          prompt: question,
          includeContext: true
        }
      });

      if (response.success) {
        const aiMessage = {
          role: 'assistant',
          text: response.data.text,
          context: response.data.context
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error(response.error || 'Failed to get response');
      }
    } catch (error) {
      console.error('Error asking AI:', error);
      setError(error.message);

      // Show error message in chat
      setMessages(prev => [...prev, {
        role: 'error',
        text: `Error: ${error.message}`
      }]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle quick action button click
   */
  function handleQuickAction(question) {
    askAI(question);
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
    <div className="flex flex-col h-full">
      {/* Tab Context Info */}
      {tabContext && (
        <div className="px-4 py-2 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-600">
            {tabsLoading ? '⟳ updating...' : `📚 ${tabContext.readable} tabs in context`}
          </span>
          <button
            onClick={loadTabContext}
            disabled={tabsLoading}
            className="text-gray-400 hover:text-owl-blue transition-colors disabled:opacity-50"
            title="Refresh tab context"
          >
            🔄
          </button>
        </div>
      )}

      {/* Quick Action Buttons - Only show when no messages */}
      {messages.length === 0 && (
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleQuickAction('Write my daily standup based on everything I worked on today across all my open tabs. Format:\nYesterday: [what I did]\nToday: [what I plan to do]\nBlockers: [any blockers or None]')}
              className="px-3 py-1.5 bg-gray-100 hover:bg-owl-blue/10 text-sm text-gray-700 rounded transition-colors"
            >
              ✍️ Write standup
            </button>
            <button
              onClick={() => handleQuickAction('Look at all my open tabs and tell me what problem I\'m trying to solve. What connects them? What am I working on?')}
              className="px-3 py-1.5 bg-gray-100 hover:bg-owl-blue/10 text-sm text-gray-700 rounded transition-colors"
            >
              🔗 Find connections
            </button>
            <button
              onClick={() => handleQuickAction('Based on my open tabs and what I\'ve worked on today, what should I focus on right now? Be specific and reference what you can see.')}
              className="px-3 py-1.5 bg-gray-100 hover:bg-owl-blue/10 text-sm text-gray-700 rounded transition-colors"
            >
              🎯 What to focus on?
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                      Used {msg.context.tabsUsed} of {msg.context.totalTabs} tabs · ~{msg.context.estimatedTokens} tokens
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 px-4 py-3 rounded-lg">
                  <div className="text-sm text-gray-500">
                    {tabContext ? `Reading ${tabContext.readable} tabs...` : 'Thinking...'}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4">
        <textarea
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
