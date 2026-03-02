import { useState, useEffect } from 'react';

/**
 * Read-only display of history import status
 * Shows when the import happened and how many entries were imported
 */
export default function HistoryImportStatus() {
  const [importData, setImportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadImportStatus();
  }, []);

  async function loadImportStatus() {
    try {
      const result = await chrome.storage.local.get('historyImport');
      if (result.historyImport) {
        setImportData(result.historyImport);
      }
    } catch (error) {
      console.error('Error loading history import status:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;

  if (!importData) {
    return null; // No import has happened yet
  }

  const importDate = new Date(importData.lastImported).toLocaleDateString('en-US', {
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
          <span className="font-medium">Status:</span> Imported on {importDate}
        </p>
        <p>
          <span className="font-medium">Entries:</span> {importData.entriesImported} work-related pages
        </p>
        <p>
          <span className="font-medium">Period:</span> Last {importData.daysImported} days
        </p>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        History is imported automatically on first install. All data stays on your device.
      </p>
    </div>
  );
}
