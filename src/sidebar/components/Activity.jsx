import { useState, useEffect } from 'react';
import { getDisplayName } from '../../content/extractors/registry.js';
import { STATS_CONFIG } from '../../constants.js';

/**
 * Activity tab - Clean data view with stats and work history
 * Shows: Last 14 days stats (most visited, most active, new discoveries) + chronological work history
 * Three states: First Install, Getting Started, Active
 */
export default function Activity() {

  // State detection
  const [appState, setAppState] = useState(null); // 'first_install', 'getting_started', 'active'
  const [loading, setLoading] = useState(true);

  // Data
  const [liveEntriesCount, setLiveEntriesCount] = useState(0);
  const [historyImportCount, setHistoryImportCount] = useState(0);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [workHistoryEntries, setWorkHistoryEntries] = useState([]);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    loadData();
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


  function openUrl(url) {
    chrome.tabs.create({ url });
  }

  // Calculate stats for configured lookback period
  function calculateStats() {
    if (workHistoryEntries.length === 0) return null;

    // Filter entries from configured lookback period
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - STATS_CONFIG.lookbackDays);
    const lookbackDateStr = lookbackDate.toISOString().split('T')[0];

    const recentEntries = workHistoryEntries.filter(entry => entry.date >= lookbackDateStr);

    if (recentEntries.length === 0) return null;

    // Most Visited - count entries per domain
    const visitCounts = {};
    recentEntries.forEach(entry => {
      visitCounts[entry.domain] = (visitCounts[entry.domain] || 0) + 1;
    });

    const mostVisited = Object.entries(visitCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, STATS_CONFIG.topDomainsLimit);

    // Most Active - sum active time per domain (only for live entries with activeTime)
    const activeTimes = {};
    recentEntries
      .filter(entry => entry.source !== 'history_import' && entry.activeTime > 0)
      .forEach(entry => {
        activeTimes[entry.domain] = (activeTimes[entry.domain] || 0) + entry.activeTime;
      });

    const mostActive = Object.entries(activeTimes)
      .map(([domain, time]) => ({ domain, time }))
      .sort((a, b) => b.time - a.time)
      .slice(0, STATS_CONFIG.topDomainsLimit);

    // Least Visited - domains with fewest visits (interesting discoveries)
    // Only show domains with low visit count to filter out regular sites
    const leastVisited = Object.entries(visitCounts)
      .map(([domain, count]) => ({ domain, count }))
      .filter(item => item.count <= STATS_CONFIG.leastVisitedMaxVisits) // Filter out frequently visited
      .sort((a, b) => a.count - b.count) // Sort ascending (least first)
      .slice(0, STATS_CONFIG.leastVisitedLimit);

    return {
      mostVisited,
      mostActive,
      leastVisited
    };
  }

  function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
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
        <p className="text-gray-600 text-sm max-w-md">
          Browse normally and come back. Your work history will build up through the day.
        </p>
      </div>
    );
  }

  // STATE 1: First Install
  if (appState === 'first_install') {
    const displayEntries = showMore ? historyEntries : historyEntries.slice(0, 30);
    const groupedEntries = groupEntriesByDate(displayEntries);
    const stats = calculateStats();

    return (
      <div className="flex flex-col h-full overflow-hidden bg-white">
        <div className="flex-1 overflow-y-auto">
          {/* Import Celebration Card */}
          <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-b border-blue-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Ready from day one
            </h2>
            <p className="text-gray-700 leading-relaxed">
              We found <span className="font-semibold">{historyImportCount} pages</span> from your last 30 days.
              OpenOwl already knows what you've been working on.
            </p>
          </div>

          {/* Never Track Info */}
          <div className="mx-4 mt-4 mb-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <p className="text-xs text-gray-600">
              <span className="font-semibold text-gray-700">Never Track</span> filters are active — personal sites (YouTube, Netflix, social media) won't appear here. Manage in Settings.
            </p>
          </div>

          {/* Stats Section */}
          {stats && (
            <div className="mx-4 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                📊 Last {STATS_CONFIG.lookbackDays} Days
              </h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Most Visited */}
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Most Visited</p>
                  <div className="space-y-1">
                    {stats.mostVisited.map(({ domain, count }) => (
                      <div key={domain} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate flex-1">{getDisplayName(domain)}</span>
                        <span className="text-gray-500 ml-2">({count})</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Most Active - won't show for fresh install with only imported history */}
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Most Active</p>
                  {stats.mostActive.length > 0 ? (
                    <div className="space-y-1">
                      {stats.mostActive.map(({ domain, time }) => (
                        <div key={domain} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700 truncate flex-1">{getDisplayName(domain)}</span>
                          <span className="text-gray-500 ml-2">({formatTime(time)})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Based on tracked activity</p>
                  )}
                </div>
              </div>

              {/* Least Visited */}
              {stats.leastVisited.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-300">
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    Least Visited <span className="text-gray-400 font-normal">(interesting discoveries)</span>
                  </p>
                  <div className="space-y-1">
                    {stats.leastVisited.map(({ domain, count }) => (
                      <div key={domain} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate flex-1">{getDisplayName(domain)}</span>
                        <span className="text-gray-500 ml-2">({count})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
  const filteredEntries = filterEntries(workHistoryEntries);
  const groupedEntries = groupEntriesByDate(filteredEntries);
  const stats = calculateStats();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="flex-1 overflow-y-auto">
        {/* Never Track Info - Always visible */}
        <div className="mx-4 mt-4 mb-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <p className="text-xs text-gray-600">
            <span className="font-semibold text-gray-700">Never Track</span> filters are active — personal sites (YouTube, Netflix, social media) won't appear here. Manage in Settings.
          </p>
        </div>

        {/* Stats Section */}
        {stats && (
          <div className="mx-4 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              📊 Last {STATS_CONFIG.lookbackDays} Days
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Most Visited */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Most Visited</p>
                <div className="space-y-1">
                  {stats.mostVisited.map(({ domain, count }) => (
                    <div key={domain} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 truncate flex-1">{getDisplayName(domain)}</span>
                      <span className="text-gray-500 ml-2">({count})</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Most Active */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Most Active</p>
                {stats.mostActive.length > 0 ? (
                  <div className="space-y-1">
                    {stats.mostActive.map(({ domain, time }) => (
                      <div key={domain} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate flex-1">{getDisplayName(domain)}</span>
                        <span className="text-gray-500 ml-2">({formatTime(time)})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Based on tracked activity</p>
                )}
              </div>
            </div>

            {/* Least Visited */}
            {stats.leastVisited.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-300">
                <p className="text-xs font-medium text-gray-600 mb-2">
                  Least Visited <span className="text-gray-400 font-normal">(interesting discoveries)</span>
                </p>
                <div className="space-y-1">
                  {stats.leastVisited.map(({ domain, count }) => (
                    <div key={domain} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 truncate flex-1">{getDisplayName(domain)}</span>
                      <span className="text-gray-500 ml-2">({count})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
