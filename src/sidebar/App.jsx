import React, { useState } from 'react';
import Settings from './components/Settings';
import Ask from './components/Ask';
import Today from './components/Today';

/**
 * Main sidebar app component
 * Handles routing between different views
 */
function App() {
  const [currentView, setCurrentView] = useState('ask');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">OpenOwl</h1>
        <p className="text-xs text-gray-500">AI browser memory for developers</p>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200 px-2 flex space-x-1">
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

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {currentView === 'ask' && <Ask />}
        {currentView === 'today' && <Today />}
        {currentView === 'settings' && <Settings />}
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
        transition-colors duration-150
        ${active
          ? 'bg-gray-50 text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }
      `}
    >
      {children}
    </button>
  );
}

export default App;
