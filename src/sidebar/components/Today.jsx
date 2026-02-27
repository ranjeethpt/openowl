import React from 'react';

/**
 * Today component - combines day log and briefing
 * Will implement full functionality in next phase
 */
function Today() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Today</h2>

      {/* Morning Briefing Section */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Morning Briefing</h3>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">
            Your morning briefing will appear here
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Get a summary of yesterday's work and suggested focus areas
          </p>
        </div>
      </div>

      {/* Activity Log Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Today's Activity</h3>
        <div className="text-center text-gray-500 mt-10">
          <p className="text-sm">Your browsing activity will appear here</p>
          <p className="text-xs mt-2 text-gray-400">
            OpenOwl tracks all tabs you visit to help you remember what you worked on
          </p>
        </div>
      </div>
    </div>
  );
}

export default Today;
