import { useState, useEffect } from 'react';
import { getDisplayName } from '../../content/extractors/registry.js';

/**
 * Today tab - Redesigned to show interpreted meaning, not raw data
 * Three states: First Install, Getting Started, Active
 */
export default function Today({ onNavigateToAsk }) {
  // State detection
  const [appState, setAppState] = useState(null); // 'first_install', 'getting_started', 'active'
  const [loading, setLoading] = useState(true);

  // Data
  const [liveEntriesCount, setLiveEntriesCount] = useState(0);
  const [historyImportCount, setHistoryImportCount] = useState(0);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [workHistoryEntries, setWorkHistoryEntries] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [liveEntriesToday, setLiveEntriesToday] = useState(0);
  const [lastActivityLog, setLastActivityLog] = useState([]);

  // UI state
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    loadData();
    checkBriefingDismissal();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      // Get live entries count
      const liveResponse = await chrome.runtime.sendMessage({
        type: 'GET_LIVE_ENTRIES_COUNT'
      });

      // Get history import count
      const historyResponse = await chrome.runtime.sendMessage({
        type: 'GET_HISTORY_IMPORT_COUNT'
      });

      const liveCount = liveResponse.success ? liveResponse.data : 0;
      const historyCount = historyResponse.success ? historyResponse.data : 0;

      setLiveEntriesCount(liveCount);
      setHistoryImportCount(historyCount);

      // Determine state
      let state;
      if (liveCount === 0 && historyCount > 0) {
        state = 'first_install';
      } else if (liveCount === 0 && historyCount === 0) {
        state = 'getting_started';
      } else {
        state = 'active';
      }

      setAppState(state);
      console.log('[Today] State detected:', state, { liveCount, historyCount });

      // Load data based on state
      if (state === 'first_install') {
        await loadFirstInstallData();
      } else if (state === 'active') {
        await loadActiveData();
      }
    } catch (error) {
      console.error('[Today] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadFirstInstallData() {
    // Load history import entries for display
    const response = await chrome.runtime.sendMessage({
      type: 'GET_HISTORY_FOR_DISPLAY',
      data: { days: 14, limit: 30 }
    });

    if (response.success) {
      setHistoryEntries(response.data);
    }
  }

  async function loadActiveData() {
    // Load work history (last 7 days)
    const historyResponse = await chrome.runtime.sendMessage({
      type: 'GET_WORK_HISTORY',
      data: { days: 7 }
    });

    if (historyResponse.success) {
      setWorkHistoryEntries(historyResponse.data);
    }

    // Get open tabs
    const tabsResponse = await chrome.runtime.sendMessage({
      type: 'GET_TABS'
    });

    if (tabsResponse.success) {
      setOpenTabs(tabsResponse.data || []);
    }

    // Get live entries today count for briefing condition
    const liveTodayResponse = await chrome.runtime.sendMessage({
      type: 'GET_LIVE_ENTRIES_TODAY_COUNT'
    });

    if (liveTodayResponse.success) {
      setLiveEntriesToday(liveTodayResponse.data);
    }

    // Get last activity log for briefing
    const lastActivityResponse = await chrome.runtime.sendMessage({
      type: 'GET_LAST_ACTIVITY_LOG'
    });

    if (lastActivityResponse.success) {
      setLastActivityLog(lastActivityResponse.data || []);
    }
  }

  async function checkBriefingDismissal() {
    const today = new Date().toISOString().split('T')[0];
    const result = await chrome.storage.local.get(`briefing_dismissed_${today}`);
    setBriefingDismissed(!!result[`briefing_dismissed_${today}`]);
  }

  async function dismissBriefing() {
    const today = new Date().toISOString().split('T')[0];
    await chrome.storage.local.set({ [`briefing_dismissed_${today}`]: true });
    setBriefingDismissed(true);
  }

  function handleStandupClick() {
    if (onNavigateToAsk) {
      onNavigateToAsk('Write my daily standup');
    }
  }

  function handleSummaryClick() {
    if (onNavigateToAsk) {
      onNavigateToAsk('Give me a detailed summary of my workday');
    }
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function formatDateLabel(dateStr) {
    // Helper to get local date string
    const toLocalDateString = (timestamp) => {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const today = toLocalDateString(Date.now());
    const yesterday = toLocalDateString(Date.now() - 86400000);

    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';

    // Parse the date string as local date (not UTC)
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dayMonth = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `${dayOfWeek}, ${dayMonth}`;
  }

  function formatLastActivityLabel(dateStr) {
    if (!dateStr) return 'recently';

    // Parse the date string as local date (not UTC)
    const [year, month, day] = dateStr.split('-').map(Number);
    const activityDate = new Date(year, month - 1, day);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const daysAgo = Math.floor((today - activityDate) / (1000 * 60 * 60 * 24));

    if (daysAgo === 1) return 'Yesterday';
    if (daysAgo === 2 || daysAgo === 3) {
      return activityDate.toLocaleDateString('en-US', { weekday: 'long' });
    }
    if (daysAgo >= 4) {
      return activityDate.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'short'
      });
    }

    return 'recently';
  }

  function getMostFrequentDomain() {
    if (openTabs.length === 0) return null;

    const domainCounts = {};
    openTabs.forEach(tab => {
      const url = new URL(tab.url);
      const domain = url.hostname;
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });

    const entries = Object.entries(domainCounts);
    const maxCount = Math.max(...entries.map(([_, count]) => count));

    if (maxCount >= 3) {
      const [domain] = entries.find(([_, count]) => count === maxCount);
      return { domain, count: maxCount };
    }

    return null;
  }

  function filterEntries(entries) {
    if (!searchQuery) return entries;

    const query = searchQuery.toLowerCase();
    return entries.filter(entry =>
      entry.title?.toLowerCase().includes(query) ||
      entry.url?.toLowerCase().includes(query) ||
      entry.domain?.toLowerCase().includes(query)
    );
  }

  function groupEntriesByDate(entries) {
    const groups = {};

    entries.forEach(entry => {
      const dateKey = entry.date;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(entry);
    });

    // Sort dates descending
    const sortedDates = Object.keys(groups).sort().reverse();

    return sortedDates.map(date => ({
      date,
      label: formatDateLabel(date),
      entries: groups[date].sort((a, b) => (b.visitedAt || 0) - (a.visitedAt || 0))
    }));
  }

  function shouldShowBriefing() {
    return (
      appState === 'active' &&
      lastActivityLog.length > 0 &&
      liveEntriesToday < 3 &&
      !briefingDismissed
    );
  }

  function openUrl(url) {
    chrome.tabs.create({ url });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // STATE 2: Getting Started
  if (appState === 'getting_started') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-6xl mb-4">🦉</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          OpenOwl is ready
        </h2>
        <p className="text-gray-600 text-sm max-w-md mb-6">
          Browse normally and come back. Your standup and history will build up through the day.
        </p>
        <button
          onClick={handleStandupClick}
          className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition"
        >
          ✍️ Write standup
        </button>
      </div>
    );
  }

  // STATE 1: First Install
  if (appState === 'first_install') {
    const displayEntries = showMore ? historyEntries : historyEntries.slice(0, 30);
    const groupedEntries = groupEntriesByDate(displayEntries);

    return (
      <div className="flex flex-col h-full overflow-hidden bg-white">
        <div className="flex-1 overflow-y-auto">
          {/* Import Celebration Card */}
          <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-b border-blue-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Ready from day one
            </h2>
            <p className="text-gray-700 mb-4 leading-relaxed">
              We found <span className="font-semibold">{historyImportCount} pages</span> from your last 30 days.
              OpenOwl already knows what you have been working on.
            </p>
            <button
              onClick={handleStandupClick}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition shadow-sm"
            >
              ✍️ Write my first standup
            </button>
          </div>

          <div className="px-4 py-3">
            <p className="text-xs text-gray-500 text-center">
              OpenOwl gets richer as you browse today.
            </p>
          </div>

          {/* Recent Work */}
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-800">Recent Work</h3>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                imported
              </span>
            </div>

            <div className="space-y-4">
              {groupedEntries.map(group => (
                <div key={group.date}>
                  <div className="text-xs font-semibold text-gray-500 mb-2">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.entries.map((entry, idx) => (
                      <div
                        key={idx}
                        onClick={() => openUrl(entry.url)}
                        className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded cursor-pointer transition"
                      >
                        <div className="text-sm text-gray-800 truncate mb-1">
                          {entry.title}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{formatTime(entry.visitedAt)}</span>
                          <span>•</span>
                          <span className="truncate">{getDisplayName(entry.domain)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {!showMore && historyEntries.length > 30 && (
                <button
                  onClick={() => setShowMore(true)}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Show more
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 3: Active
  const mostFrequentDomain = getMostFrequentDomain();
  const filteredEntries = filterEntries(workHistoryEntries);
  const groupedEntries = groupEntriesByDate(filteredEntries);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="flex-1 overflow-y-auto">
        {/* Morning Briefing Card */}
        {shouldShowBriefing() && (() => {
          const lastActivityDate = lastActivityLog[0]?.date;
          const lastActivityLabel = formatLastActivityLabel(lastActivityDate);

          return (
            <div className="m-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">☀️</span>
                  <h3 className="text-sm font-semibold text-gray-800">
                    Welcome back
                  </h3>
                </div>
                <button
                  onClick={dismissBriefing}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-gray-700 mb-3">
                You worked on <span className="font-medium">{lastActivityLabel}</span>. Want a quick recap?
              </p>
              <button
                onClick={handleStandupClick}
                className="text-sm px-4 py-2 bg-amber-100 hover:bg-amber-200 text-gray-800 rounded transition"
              >
                ✍️ Show me
              </button>
            </div>
          );
        })()}

        {/* Right Now Card */}
        {openTabs.length > 0 ? (
          <div className="m-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">💻</span>
              <h3 className="text-sm font-semibold text-gray-800">Right now</h3>
            </div>
            <p className="text-sm text-gray-700 mb-4">
              {mostFrequentDomain ? (
                <>
                  <span className="font-medium">{openTabs.length} tabs</span> open,
                  mostly <span className="font-medium">{getDisplayName(mostFrequentDomain.domain)}</span>
                </>
              ) : (
                <>
                  <span className="font-medium">{openTabs.length} tabs</span> open
                </>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleStandupClick}
                className="flex-1 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
              >
                ✍️ Write standup
              </button>
              <button
                onClick={handleSummaryClick}
                className="flex-1 text-sm px-4 py-2 bg-blue-100 hover:bg-blue-200 text-gray-800 rounded transition"
              >
                📊 Day summary
              </button>
            </div>
          </div>
        ) : (
          <div className="m-4 flex gap-2">
            <button
              onClick={handleStandupClick}
              className="flex-1 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
            >
              ✍️ Write standup
            </button>
            <button
              onClick={handleSummaryClick}
              className="flex-1 text-sm px-4 py-2 bg-blue-100 hover:bg-blue-200 text-gray-800 rounded transition"
            >
              📊 Day summary
            </button>
          </div>
        )}

        {/* Work History Section */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Work History</h3>
            <div className="relative flex-1 max-w-xs ml-4">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs px-3 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {searchQuery ? 'No matches for your query' : 'No work history yet'}
            </div>
          ) : (
            <div className="space-y-4">
              {groupedEntries.map(group => (
                <div key={group.date}>
                  <div className="text-xs font-semibold text-gray-500 mb-2">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.entries.map((entry, idx) => (
                      <div
                        key={idx}
                        onClick={() => openUrl(entry.url)}
                        className={`px-3 py-2 rounded cursor-pointer transition ${
                          entry.source === 'history_import'
                            ? 'bg-gray-50 hover:bg-gray-100'
                            : 'bg-white hover:bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-800 truncate mb-1">
                              {entry.title}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{formatTime(entry.visitedAt)}</span>
                              <span>•</span>
                              <span className="truncate">{getDisplayName(entry.domain)}</span>
                              {entry.source === 'history_import' && (
                                <>
                                  <span>•</span>
                                  <span className="text-gray-400">imported</span>
                                </>
                              )}
                            </div>
                          </div>
                          {entry.copied && entry.copied.length > 0 && (
                            <span className="text-xs">📋</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {groupedEntries.length > 0 && !showMore && (
                <button
                  onClick={() => setShowMore(true)}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
