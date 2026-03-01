import { useState, useEffect } from 'react';

/**
 * Today tab - Clean, focused view of today's work
 */
export default function Today({ onNavigateToAsk }) {
  const [dayLog, setDayLog] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  useEffect(() => {
    loadTodayData();
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
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function generateSmartSummary() {
    if (dayLog.length === 0) return null;

    // Calculate time by domain
    const domainTimes = {};
    dayLog.forEach(entry => {
      const domain = entry.domain || 'unknown';
      domainTimes[domain] = (domainTimes[domain] || 0) + (entry.activeTime || 0);
    });

    // Sort by time spent
    const sortedDomains = Object.entries(domainTimes)
      .sort((a, b) => b[1] - a[1])
      .map(([domain, time]) => ({ domain, time }));

    const topDomain = sortedDomains[0];
    const researchDomains = sortedDomains.slice(1, 3).filter(d => d.time > 60000); // > 1 min

    // Check for email/calendar
    const emailEntry = dayLog.find(e =>
      e.domain?.includes('mail.google') ||
      e.domain?.includes('outlook') ||
      e.domain?.includes('gmail')
    );

    return {
      topDomain,
      researchDomains,
      emailEntry
    };
  }

  function getDomainsByTime() {
    if (dayLog.length === 0) return [];

    const domainTimes = {};
    dayLog.forEach(entry => {
      const domain = entry.domain || 'unknown';
      domainTimes[domain] = (domainTimes[domain] || 0) + (entry.activeTime || 0);
    });

    return Object.entries(domainTimes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, time]) => ({ domain, time }));
  }

  function groupByHour() {
    const groups = {};
    dayLog.forEach(entry => {
      const hour = new Date(entry.visitedAt).getHours();
      const hourKey = `${hour}:00`;
      if (!groups[hourKey]) {
        groups[hourKey] = [];
      }
      groups[hourKey].push(entry);
    });

    return Object.entries(groups)
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
      .map(([hour, entries]) => ({ hour, entries }));
  }

  function handleQuickAction(action) {
    // Navigate to Ask tab - parent component will handle the switch
    if (onNavigateToAsk) {
      onNavigateToAsk(action);
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

  const summary = generateSmartSummary();
  const domainsByTime = getDomainsByTime();
  const maxTime = domainsByTime[0]?.time || 1;
  const hourlyGroups = groupByHour();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Section 1: Smart Summary Card */}
      {summary && (
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Today's Focus
          </h3>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
            {/* Main focus */}
            <div>
              <div className="text-sm text-gray-700">
                🎯 <span className="font-medium">Main focus:</span>{' '}
                {summary.topDomain.domain}
              </div>
              <div className="text-xs text-gray-500 ml-5">
                {formatTime(summary.topDomain.time)} active
              </div>
            </div>

            {/* Research */}
            {summary.researchDomains.length > 0 && (
              <div>
                <div className="text-sm text-gray-700">
                  📚 <span className="font-medium">Also researched:</span>
                </div>
                <div className="text-xs text-gray-500 ml-5">
                  {summary.researchDomains.map(d => d.domain).join(', ')}
                </div>
              </div>
            )}

            {/* Email check */}
            {summary.emailEntry && (
              <div className="text-sm text-gray-700">
                📬 Checked email at {formatTimestamp(summary.emailEntry.visitedAt)}
                {summary.emailEntry.activeTime > 0 && (
                  <span className="text-xs text-gray-500">
                    {' '}({formatTime(summary.emailEntry.activeTime)})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Standup button */}
          <button
            onClick={() => handleQuickAction('standup')}
            className="mt-3 w-full bg-owl-blue text-white text-sm py-2 px-3 rounded hover:bg-owl-blue/90 transition"
          >
            ✍️ Write standup from today
          </button>
        </div>
      )}

      {/* Section 2: Stats Row */}
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

      {/* Section 3: Top Domains by Time */}
      {domainsByTime.length > 0 && (
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Top Domains by Time
          </h3>
          <div className="space-y-2">
            {domainsByTime.map((item, i) => {
              const barWidth = Math.round((item.time / maxTime) * 100);
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-700 truncate flex-1">
                      {item.domain}
                    </span>
                    <span className="text-gray-500 ml-2">
                      {formatTime(item.time)}
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
          <div className="mt-3 space-y-2">
            {hourlyGroups.map((group, i) => (
              <details key={i} className="group">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100">
                    <span className="text-sm font-medium text-gray-700">
                      {group.hour.padStart(2, '0')} ({group.entries.length} visits)
                    </span>
                    <span className="text-gray-400 group-open:rotate-90 transition-transform">
                      ▶
                    </span>
                  </div>
                </summary>
                <div className="mt-1 ml-3 pl-3 border-l-2 border-gray-200 space-y-1">
                  {group.entries.map((entry, j) => (
                    <div
                      key={j}
                      className="text-xs text-gray-600 py-1"
                    >
                      <div className="truncate">{entry.title}</div>
                      <div className="text-gray-400">
                        {entry.domain} • {formatTimestamp(entry.visitedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* Section 5: Quick Actions */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleQuickAction('standup')}
            className="flex-1 bg-gray-100 hover:bg-owl-blue/10 text-gray-700 text-xs py-2 px-3 rounded transition"
          >
            ✍️ Write standup
          </button>
          <button
            onClick={() => handleQuickAction('summary')}
            className="flex-1 bg-gray-100 hover:bg-owl-blue/10 text-gray-700 text-xs py-2 px-3 rounded transition"
          >
            📊 Day summary
          </button>
          <button
            onClick={() => handleQuickAction('focus')}
            className="flex-1 bg-gray-100 hover:bg-owl-blue/10 text-gray-700 text-xs py-2 px-3 rounded transition"
          >
            🎯 What to focus on?
          </button>
        </div>
      </div>
    </div>
  );
}
