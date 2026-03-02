import { useState, useEffect } from 'react';
import * as storage from '../../storage/index.js';

/**
 * Preferences component - Controls what gets logged in day log
 */
export default function Preferences() {
  const [preferences, setPreferences] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newAlwaysDomain, setNewAlwaysDomain] = useState('');
  const [newNeverDomain, setNewNeverDomain] = useState('');

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    const prefs = await storage.getPreferences();
    setPreferences(prefs);
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');

    try {
      await storage.savePreferences(preferences);
      setMessage('Preferences saved!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error saving preferences');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  function addDomain(list, domain) {
    const trimmed = domain.trim().toLowerCase();
    if (!trimmed) return;

    // Validate: must contain a dot (unless it's localhost)
    if (!trimmed.includes('.') && trimmed !== 'localhost') {
      setMessage('Domain must contain a dot (e.g., github.com)');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Check if already exists
    if (preferences[list].includes(trimmed)) {
      setMessage('Domain already in list');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setPreferences({
      ...preferences,
      [list]: [...preferences[list], trimmed]
    });

    // Clear input
    if (list === 'alwaysTrack') setNewAlwaysDomain('');
    else setNewNeverDomain('');
  }

  function removeDomain(list, domain) {
    setPreferences({
      ...preferences,
      [list]: preferences[list].filter(d => d !== domain)
    });
  }

  function updateWorkHours(field, value) {
    setPreferences({
      ...preferences,
      workHours: {
        ...preferences.workHours,
        [field]: value
      }
    });
  }

  if (!preferences) {
    return <div className="p-4 text-gray-500">Loading preferences...</div>;
  }

  return (
    <div className="border border-gray-200 rounded-lg mb-6">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
      >
        <h3 className="text-sm font-semibold text-gray-900">
          What to Track
        </h3>
        <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 pt-0 space-y-6">
          {/* Domain Filters */}
          <div className="grid grid-cols-2 gap-4">
            {/* Always Track */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Always Track (work domains)
              </label>
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-48 overflow-y-auto">
                <div className="flex flex-wrap gap-1 mb-2">
                  {preferences.alwaysTrack.map((domain, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs px-2 py-1 rounded"
                    >
                      {domain}
                      <button
                        onClick={() => removeDomain('alwaysTrack', domain)}
                        className="hover:text-green-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newAlwaysDomain}
                    onChange={(e) => setNewAlwaysDomain(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDomain('alwaysTrack', newAlwaysDomain);
                      }
                    }}
                    placeholder="domain.com"
                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                  />
                  <button
                    onClick={() => addDomain('alwaysTrack', newAlwaysDomain)}
                    className="text-xs bg-green-600 text-white px-2 rounded hover:bg-green-700"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                These domains are always logged
              </p>
            </div>

            {/* Never Track */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Never Track (personal/noise)
              </label>
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-48 overflow-y-auto">
                <div className="flex flex-wrap gap-1 mb-2">
                  {preferences.neverTrack.map((domain, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-xs px-2 py-1 rounded"
                    >
                      {domain}
                      <button
                        onClick={() => removeDomain('neverTrack', domain)}
                        className="hover:text-red-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newNeverDomain}
                    onChange={(e) => setNewNeverDomain(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDomain('neverTrack', newNeverDomain);
                      }
                    }}
                    placeholder="domain.com"
                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                  />
                  <button
                    onClick={() => addDomain('neverTrack', newNeverDomain)}
                    className="text-xs bg-red-600 text-white px-2 rounded hover:bg-red-700"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                These domains are never logged
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded p-2">
            💡 Anything not in either list: tracked only if active time {">"} 30 seconds
          </p>

          {/* Work Hours */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">
                Only track during work hours
              </label>
              <button
                onClick={() => updateWorkHours('enabled', !preferences.workHours.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  preferences.workHours.enabled ? 'bg-owl-blue' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    preferences.workHours.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {preferences.workHours.enabled && (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={preferences.workHours.start}
                  onChange={(e) => updateWorkHours('start', e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1"
                />
                <span className="text-xs text-gray-500">to</span>
                <input
                  type="time"
                  value={preferences.workHours.end}
                  onChange={(e) => updateWorkHours('end', e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1"
                />
              </div>
            )}
          </div>

          {/* Standup Format */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Standup Format
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="standupFormat"
                  value="bullets"
                  checked={preferences.standupFormat === 'bullets'}
                  onChange={(e) => setPreferences({...preferences, standupFormat: e.target.value})}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-xs font-medium">Bullets (default)</div>
                  <div className="text-xs text-gray-500 font-mono bg-gray-50 p-1 rounded mt-1">
                    Yesterday:
                    <br />• item
                    <br />Today:
                    <br />• item
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="standupFormat"
                  value="slack"
                  checked={preferences.standupFormat === 'slack'}
                  onChange={(e) => setPreferences({...preferences, standupFormat: e.target.value})}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-xs font-medium">Slack</div>
                  <div className="text-xs text-gray-500 font-mono bg-gray-50 p-1 rounded mt-1">
                    *Yesterday:* item | *Today:* item
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="standupFormat"
                  value="prose"
                  checked={preferences.standupFormat === 'prose'}
                  onChange={(e) => setPreferences({...preferences, standupFormat: e.target.value})}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-xs font-medium">Prose</div>
                  <div className="text-xs text-gray-500 bg-gray-50 p-1 rounded mt-1">
                    Yesterday I worked on... Today I plan to...
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Log Retention */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Keep logs for {preferences.logRetentionDays} days
            </label>
            <input
              type="range"
              min="7"
              max="90"
              value={preferences.logRetentionDays}
              onChange={(e) => setPreferences({...preferences, logRetentionDays: parseInt(e.target.value)})}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>7 days</span>
              <span>90 days</span>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full px-4 py-2 rounded-lg font-medium text-sm ${
              saving
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-owl-blue text-white hover:bg-owl-blue/90'
            }`}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>

          {/* Message */}
          {message && (
            <div className="text-xs text-center text-green-700 bg-green-50 border border-green-200 rounded p-2">
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
