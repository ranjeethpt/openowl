import React, { useState, useEffect } from 'react';
import Settings from './components/Settings';
import Ask from './components/Ask';
import Today from './components/Today';

/**
 * Main sidebar app component
 * Handles routing between different views
 */
function App() {
  const [currentView, setCurrentView] = useState('ask'); // Start on Ask tab
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState([]);

  // Check if app is configured on mount
  useEffect(() => {
    checkConfiguration();
    checkChatAutoClear();
  }, []);

  async function checkChatAutoClear() {
    try {
      const { lastChatDate } = await chrome.storage.local.get('lastChatDate');
      const today = new Date().toDateString();

      if (lastChatDate && lastChatDate !== today) {
        // Clear chat messages (they will be passed to Ask component)
        setChatMessages([]);
      } else {
        // Load messages from storage if they exist
        const { messages } = await chrome.storage.local.get('messages');
        if (messages) setChatMessages(messages);
      }

      await chrome.storage.local.set({ lastChatDate: today });
    } catch (error) {
      console.error('Error auto-clearing chat:', error);
    }
  }

  // Update storage whenever chatMessages change
  useEffect(() => {
    if (!isLoading) {
      chrome.storage.local.set({ messages: chatMessages });
    }
  }, [chatMessages, isLoading]);

  /**
   * Check if LLM is properly configured
   * Returns true if:
   * - Ollama is selected AND connection test succeeds
   * - OR cloud provider (claude/openai/gemini) is selected AND API key exists
   */
  async function checkConfiguration() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (!response.success) {
        setIsConfigured(false);
        return;
      }

      const data = response.data;
      const provider = data.selectedProvider;

      // No provider selected yet
      if (!provider) {
        setIsConfigured(false);
        return;
      }

      // Check Ollama: test actual connection
      if (provider === 'ollama') {
        try {
          const testResponse = await chrome.runtime.sendMessage({ type: 'TEST_OLLAMA_CONNECTION' });
          setIsConfigured(testResponse.success === true);
          return;
        } catch (error) {
          console.warn('Ollama connection test failed:', error);
          setIsConfigured(false);
          return;
        }
      }

      // Check cloud providers: verify API key exists
      if (provider === 'claude' || provider === 'openai' || provider === 'gemini') {
        const apiKeys = data.apiKeys || {};
        const hasKey = apiKeys[provider] && apiKeys[provider].trim().length > 0;
        setIsConfigured(hasKey);
        return;
      }

      // Unknown provider
      setIsConfigured(false);
    } catch (error) {
      console.error('Error checking configuration:', error);
      setIsConfigured(false);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col">
      {/* Header with Tabs */}
      <header className="bg-owl-primary px-4 pt-3 pb-0 shadow-lg">
        {/* Logo and Title */}
        <div className="flex items-center gap-3 mb-4">
          <img
            src="/icons/icon48.png"
            alt="OpenOwl Logo"
            className="w-8 h-8 flex-shrink-0 rounded-lg"
          />
          <div>
            <h1 className="text-lg font-semibold">
              <span className="text-white">Open</span>
              <span className="text-owl-accent">Owl</span>
            </h1>
            <p className="text-xs text-slate-400">AI browser memory for developers</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1">
          <TabButton
            active={currentView === 'ask'}
            onClick={() => setCurrentView('ask')}
          >
            Ask
          </TabButton>
          <TabButton
            active={currentView === 'today'}
            onClick={() => setCurrentView('today')}
          >
            Today
          </TabButton>
          <TabButton
            active={currentView === 'settings'}
            onClick={() => setCurrentView('settings')}
          >
            Settings
          </TabButton>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        <div className="flex flex-col h-full">
          {currentView === 'ask' && (
            <Ask
              messages={chatMessages}
              onMessagesChange={setChatMessages}
              onNavigateToSettings={() => setCurrentView('settings')}
              isLLMConfigured={isConfigured}
            />
          )}
          {currentView === 'today' && (
            <Today
              onNavigateToAsk={(prompt) => {
                setCurrentView('ask');
                if (prompt) {
                  setChatMessages(prev => [...prev, { role: 'user', text: prompt, autoRun: true }]);
                }
              }}
              isLLMConfigured={isConfigured}
            />
          )}
          {currentView === 'settings' && (
            <Settings
              onSave={checkConfiguration}
              isLLMConfigured={isConfigured}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Tab button component
 */
function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 text-sm font-medium rounded-t-lg
        transition-all duration-200
        ${active
          ? 'bg-slate-50 text-owl-blue'
          : 'text-slate-300 hover:text-owl-accent hover:bg-owl-secondary'
        }
      `}
      style={{ cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

export default App;
