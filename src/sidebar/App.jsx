import React, { useState, useEffect } from 'react';
import Settings from './components/Settings';
import Ask from './components/Ask';
import Today from './components/Today';

/**
 * Main sidebar app component
 * Handles routing between different views
 */
function App() {
  const [currentView, setCurrentView] = useState('settings');
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if app is configured on mount
  useEffect(() => {
    checkConfiguration();
  }, []);

  async function checkConfiguration() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response.success) {
        const data = response.data;
        // Check if user has configured at least one API key or is using Ollama
        const hasApiKey = Object.keys(data.apiKeys || {}).some(key => data.apiKeys[key]);
        const isOllama = data.selectedProvider === 'ollama';
        const configured = hasApiKey || (isOllama && !!data.ollamaUrl);

        setIsConfigured(configured);
        if (configured) {
          setCurrentView('ask');
        }
      }
    } catch (error) {
      console.error('Error checking configuration:', error);
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
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
          {isConfigured && (
            <>
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
            </>
          )}
          <TabButton
            active={currentView === 'settings'}
            onClick={() => setCurrentView('settings')}
          >
            Settings
          </TabButton>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {!isConfigured && currentView === 'settings' && (
          <div className="p-6 bg-owl-blue/10 border-b border-owl-blue/20">
            <p className="text-sm text-owl-blue font-semibold">👋 Welcome to OpenOwl!</p>
            <p className="text-xs text-gray-600 mt-1">Connect your AI to get started. Takes 30 seconds.</p>
          </div>
        )}
        {currentView === 'ask' && <Ask />}
        {currentView === 'today' && <Today />}
        {currentView === 'settings' && <Settings onSave={checkConfiguration} />}
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
