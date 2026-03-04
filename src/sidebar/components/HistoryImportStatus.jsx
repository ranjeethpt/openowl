import { useState, useEffect } from 'react';
import { getHistoryImportStats } from '../../storage/index.js';

/**
 * Read-only display of history import status
 * Derives status directly from database (source of truth)
 */
export default function HistoryImportStatus() {
  const [importStats, setImportStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadImportStatus();
  }, []);

  async function loadImportStatus() {
    try {
      const stats = await getHistoryImportStats();
      setImportStats(stats);
    } catch (error) {
      console.error('Error loading history import status:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;

  if (!importStats) {
    return null; // No import has happened yet
  }

  const importDate = new Date(importStats.newestDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">
        📦 History Import
      </h3>
      <div className="text-xs text-gray-700 space-y-1">
        <p>
          <span className="font-medium">Status:</span> {importStats.entriesImported} entries imported
        </p>
        <p>
          <span className="font-medium">Period:</span> {importStats.oldestDate} to {importStats.newestDate} ({importStats.daysSpan} days)
        </p>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        History is imported automatically on first install. All data stays on your device.
      </p>
    </div>
  );
}
