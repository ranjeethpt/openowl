import { useState, useEffect } from 'react';
import { getDisplayName } from '../../content/extractors/registry.js';

/**
 * Today tab - Clean, focused view of today's work
 */
export default function Today({ onNavigateToAsk }) {
  const [dayLog, setDayLog] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [showImportBanner, setShowImportBanner] = useState(false);
  const [historyImport, setHistoryImport] = useState(null);

  // LLM insight state
  const [insightText, setInsightText] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightCached, setInsightCached] = useState(false);


  useEffect(() => {
    loadTodayData();
    checkHistoryImport();
    loadInsight();
  }, []);

  async function loadTodayData() {
    setLoading(true);
    setError(null);

    try {
      const logResponse = await chrome.runtime.sendMessage({
        type: 'GET_DAY_LOG'
      });

      if (!logResponse.success) {
        throw new Error(logResponse.error);
      }

      const statsResponse = await chrome.runtime.sendMessage({
        type: 'GET_TODAY_STATS'
      });

      if (!statsResponse.success) {
        throw new Error(statsResponse.error);
      }

      setDayLog(logResponse.data);
      setStats(statsResponse.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkHistoryImport() {
    try {
      const result = await chrome.storage.local.get(['historyImport', 'historyImported']);
      if (result.historyImported && !result.historyImport?.shown) {
        setHistoryImport(result.historyImport);
        setShowImportBanner(true);
        
        // Mark as shown so never appears again
        await chrome.storage.local.set({
          historyImport: { ...result.historyImport, shown: true }
        });
        
        // Auto dismiss after 10 seconds
        setTimeout(() => setShowImportBanner(false), 10000);
      }
    } catch (error) {
      console.error('Error checking history import:', error);
    }
  }

  function formatTime(ms) {
    if (ms < 1000) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  function formatTimestamp(timestamp) {
    const tsNumber = Number(timestamp);
    const date = new Date(tsNumber);
    const isValid = !isNaN(date.getTime());

    if (!isValid) return 'Recently';

    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  async function loadInsight(forceRefresh = false) {
    if (insightLoading) return;

    console.log('[Today] loadInsight called with forceRefresh =', forceRefresh);
    setInsightLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_INSIGHT',
        data: { forceRefresh }
      });

      console.log('[Today] GENERATE_INSIGHT response:', response);

      if (!response.success) {
        console.error('Failed to generate insight:', response.error);
        setInsightText(null);
        return;
      }

      if (response.data.text) {
        setInsightText(response.data.text);
        setInsightCached(response.data.cached || false);
        console.log('[Today] Insight loaded, cached =', response.data.cached);
      } else {
        setInsightText(null);
      }
    } catch (err) {
      console.error('Error loading insight:', err);
      setInsightText(null);
    } finally {
      setInsightLoading(false);
    }
  }

  function refreshInsight() {
    // Force regenerate by bypassing cache
    setInsightText(null);
    setInsightCached(false);
    loadInsight(true); // Pass forceRefresh=true
  }

  function getTopDomains() {
    if (dayLog.length === 0) return { domains: [], hasTimeData: false };

    const domainStats = {};
    let totalTimeTracked = 0;

    dayLog.forEach(entry => {
      const domain = entry.domain || 'unknown';
      if (!domainStats[domain]) {
        domainStats[domain] = { time: 0, count: 0 };
      }
      domainStats[domain].time += (entry.activeTime || 0);
      domainStats[domain].count += 1;
      totalTimeTracked += (entry.activeTime || 0);
    });

    // Check if we have meaningful time data (at least 30 seconds total)
    const hasTimeData = totalTimeTracked > 30000;

    // Sort by time if we have it, otherwise by count
    const sorted = Object.entries(domainStats)
      .sort((a, b) => {
        if (hasTimeData) {
          return b[1].time - a[1].time;
        } else {
          return b[1].count - a[1].count;
        }
      })
      .slice(0, 5)
      .map(([domain, stats]) => ({
        domain,
        time: stats.time,
        count: stats.count
      }));

    return { domains: sorted, hasTimeData };
  }

  function getHourlyGroups() {
    if (dayLog.length === 0) return [];

    // Separate today's live entries from imported history
    const todayEntries = dayLog.filter(e => e.source !== 'history_import' && (e.activeTime || 0) > 3000);
    const historyEntries = dayLog.filter(e => e.source === 'history_import');

    const groups = {};

    // Group today's entries by hour
    todayEntries.forEach(entry => {
      const tsNumber = Number(entry.visitedAt);
      const date = new Date(tsNumber);
      if (isNaN(date.getTime())) return;

      const hour = date.getHours();
      const key = `today-${hour}`;
      if (!groups[key]) {
        groups[key] = { type: 'hour', hour, entries: [] };
      }
      groups[key].entries.push(entry);
    });

    // Group history entries by original date
    const historyByDate = {};
    historyEntries.forEach(entry => {
      const dateKey = entry.originalDate || entry.date;
      if (!historyByDate[dateKey]) {
        historyByDate[dateKey] = [];
      }
      historyByDate[dateKey].push(entry);
    });

    // Add history groups (sorted by date descending)
    Object.entries(historyByDate)
      .sort((a, b) => b[0].localeCompare(a[0])) // Most recent date first
      .forEach(([dateStr, entries]) => {
        groups[`history-${dateStr}`] = {
          type: 'date',
          date: dateStr,
          entries: entries.slice(0, 10) // Limit to 10 per date to avoid overwhelming
        };
      });

    // Sort: today's hours first (most recent), then history dates
    return Object.entries(groups)
      .sort((a, b) => {
        const [keyA, groupA] = a;
        const [keyB, groupB] = b;

        if (groupA.type === 'hour' && groupB.type === 'hour') {
          return parseInt(groupB.hour) - parseInt(groupA.hour);
        }
        if (groupA.type === 'hour') return -1; // Today first
        if (groupB.type === 'hour') return 1;

        // Both history - sort by date descending
        return groupB.date.localeCompare(groupA.date);
      })
      .map(([key, group]) => {
        if (group.type === 'hour') {
          const h = group.hour;
          const ampm = h >= 12 ? 'PM' : 'AM';
          const displayHour = h % 12 || 12;
          return { hour: `${displayHour}:00 ${ampm}`, entries: group.entries };
        } else {
          // Format date nicely
          const date = new Date(group.date + 'T12:00:00');
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

          let label;
          if (group.date === today) {
            label = 'Today';
          } else if (group.date === yesterday) {
            label = 'Yesterday';
          } else {
            label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }

          return { hour: label, entries: group.entries };
        }
      });
  }

  function handleQuickAction(type) {
    let prompt;
    switch (type) {
      case 'standup':
        prompt = 'Write my daily standup based on everything I worked on today. Format:\nYesterday: [what I did]\nToday: [what I plan to do]\nBlockers: [any blockers or None]';
        break;
      case 'summary':
        prompt = 'Give me a detailed summary of my workday based on my browsing history. What did I achieve? What were the main themes? Group by activity type.';
        break;
      case 'focus':
        prompt = 'Based on my open tabs and what I\'ve worked on today, what should I focus on right now? Be specific and reference what you can see.';
        break;
      default:
        prompt = '';
    }

    // Navigate to Ask tab with prompt
    if (onNavigateToAsk) {
      onNavigateToAsk(prompt);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading today's activity...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700">
          Error: {error}
        </div>
      </div>
    );
  }

  if (!stats || dayLog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <img
          src="/icons/icon128.png"
          alt="OpenOwl"
          className="w-24 h-24 mb-4"
        />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          No activity yet today
        </h2>
        <p className="text-gray-500 text-sm max-w-md">
          OpenOwl is tracking your browsing activity. As you work, you'll see
          your visited pages, time spent, and insights appear here.
        </p>
      </div>
    );
  }

  const topDomainsResult = getTopDomains();
  const topDomains = topDomainsResult.domains;
  const hasTimeData = topDomainsResult.hasTimeData;
  const maxValue = hasTimeData
    ? (topDomains[0]?.time || 1)
    : (topDomains[0]?.count || 1);
  const hourlyGroups = getHourlyGroups();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* History Import Banner (one-time) */}
      {showImportBanner && historyImport && (
        <div className="flex-shrink-0 mx-4 mt-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <span className="text-base">📦</span>
            <p className="text-xs text-gray-800 font-medium">
              Imported {historyImport.entriesImported} items from your recent work history.
            </p>
          </div>
          <button
            onClick={() => setShowImportBanner(false)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-blue-100 transition-colors"
            title="Dismiss"
          >
            <span className="text-xs">✕</span>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Section 1: Today's Insight (LLM-powered) */}
      {(insightText || insightLoading || dayLog.length > 0) && (
        <div className="p-4 bg-owl-blue/5 border-b border-owl-blue/10">
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="font-semibold text-gray-900">
              Your Work Patterns
            </h2>
            <button
              onClick={refreshInsight}
              disabled={insightLoading}
              className="text-gray-400 hover:text-owl-blue transition-colors text-sm disabled:opacity-50"
              title={insightCached ? "Refresh insight (cached)" : "Refresh insight"}
            >
              {insightLoading ? '⏳' : '🔄'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            {new Date().toLocaleDateString('en-AU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </p>

          <div className="bg-white border border-owl-blue/10 rounded-lg p-4 shadow-sm">
            {insightLoading ? (
              <div className="flex items-center gap-3 text-gray-500">
                <div className="animate-spin text-xl">⚙️</div>
                <span className="text-sm">Analyzing your activity...</span>
              </div>
            ) : insightText ? (
              <>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {insightText}
                </p>
                {stats && stats.totalActiveTime > 0 && (
                  <div className="mt-3 flex gap-4 text-xs text-gray-500 pt-3 border-t border-gray-100">
                    <span>📊 {stats.totalVisits} visits</span>
                    <span>⏱️ {formatTime(stats.totalActiveTime)} active</span>
                    <span>📄 {stats.uniquePages} unique pages</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-gray-500">
                  Start browsing to see insights about your work patterns...
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Section 2: Quick Actions */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Quick Actions
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleQuickAction('standup')}
            className="bg-gray-100 hover:bg-owl-blue/10 text-gray-700 text-xs py-2 px-3 rounded transition"
          >
            ✍️ Write standup
          </button>
          <button
            onClick={() => handleQuickAction('summary')}
            className="bg-gray-100 hover:bg-owl-blue/10 text-gray-700 text-xs py-2 px-3 rounded transition"
          >
            📊 Day summary
          </button>
          <button
            onClick={() => handleQuickAction('focus')}
            className="bg-gray-100 hover:bg-owl-blue/10 text-gray-700 text-xs py-2 px-3 rounded transition"
          >
            🎯 What to focus on?
          </button>
        </div>
      </div>

      {/* Section 3: Stats Row */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-around text-center">
          <div>
            <div className="text-2xl font-bold text-gray-800">
              {stats.totalVisits}
            </div>
            <div className="text-xs text-gray-500">visits</div>
          </div>
          <div className="w-px h-10 bg-gray-200"></div>
          <div>
            <div className="text-2xl font-bold text-gray-800">
              {stats.uniquePages}
            </div>
            <div className="text-xs text-gray-500">pages</div>
          </div>
          <div className="w-px h-10 bg-gray-200"></div>
          <div>
            <div className="text-2xl font-bold text-gray-800">
              {formatTime(stats.totalActiveTime)}
            </div>
            <div className="text-xs text-gray-500">active</div>
          </div>
        </div>
      </div>

      {/* Section 3: Top Domains */}
      {topDomains.length > 0 && (
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {hasTimeData ? 'Top Domains by Time' : 'Top Domains by Visits'}
          </h3>
          <div className="space-y-2">
            {topDomains.map((item, i) => {
              const value = hasTimeData ? item.time : item.count;
              const barWidth = Math.round((value / maxValue) * 100);
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-700 truncate flex-1">
                      {getDisplayName(item.domain)}
                    </span>
                    <span className="text-gray-500 ml-2">
                      {hasTimeData ? formatTime(item.time) : `${item.count} visits`}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-owl-blue h-1.5 rounded-full transition-all"
                      style={{ width: `${barWidth}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 4: Timeline (Collapsed by default) */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={() => setTimelineExpanded(!timelineExpanded)}
          className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 hover:text-gray-900"
        >
          <span>Full Timeline</span>
          <span>{timelineExpanded ? '▲' : '▼'}</span>
        </button>

        {timelineExpanded && (
          <div className="mt-3 space-y-3">
            {hourlyGroups.map((group, i) => (
              <details key={i} className="group border border-gray-100 rounded-lg overflow-hidden">
                <summary className="cursor-pointer list-none bg-gray-50 p-2.5 flex items-center justify-between hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">
                      {group.hour}
                    </span>
                    <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {group.entries.length} visits
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 group-open:rotate-90 transition-transform">
                    ▶
                  </span>
                </summary>
                <div className="bg-white divide-y divide-gray-50">
                  {group.entries.map((entry, j) => (
                    <div
                      key={j}
                      className="px-3 py-2 hover:bg-slate-50 transition-colors"
                    >
                      <div className="text-xs font-medium text-gray-800 truncate mb-0.5">
                        {entry.title}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] text-gray-400 truncate flex-1">
                          {getDisplayName(entry.domain)} • {formatTimestamp(entry.visitedAt)}
                        </div>
                        <div className="text-[10px] font-mono text-gray-400 ml-2">
                          {formatTime(entry.activeTime)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      </div>
    </div>
  );
}
