/**
 * Custom Template Runner
 * Handles gathering data and validation for user-created templates
 */

import { getEntriesForRange } from '../storage/index.js';

// Empty state messages
export const EMPTY_MESSAGES = {
  no_data_for_range: "No activity found for this time range. Try extending to a longer period or check your work hours filter in Preferences.",
  no_data_for_domain: "No activity found for the domains in this template. You may not have visited these sites in this period, or they may be in your never-track list.",
  no_data_at_all: "No activity recorded yet. Browse with OpenOwl active for a day and try again.",
  week_just_started: "The week just started so there is limited data. Try Yesterday or Last 7 days instead.",
  retention_mismatch: "Your log retention setting may be shorter than the time range selected. Try a shorter time range or adjust retention in Preferences."
};

/**
 * Build custom gatherer function for a template
 * @param {Object} filters - Template filters configuration
 * @returns {Promise<Object>} Gathered data with isEmpty flag
 */
export async function buildCustomGatherer(filters) {
  try {
    // Step 1: Get entries for time range
    let entries = await getEntriesForRange(filters.timeRange);
    const hadEntriesBeforeDomainFilter = entries.length > 0;

    // Step 2: Filter by domains if specified
    if (filters.domains && Array.isArray(filters.domains) && filters.domains.length > 0) {
      entries = entries.filter(entry => {
        const domain = entry.domain || '';
        const url = entry.url || '';
        return filters.domains.some(filterDomain =>
          domain.includes(filterDomain) || url.includes(filterDomain)
        );
      });
    }
    const hadEntriesAfterDomainFilter = entries.length > 0;

    // Step 3: Filter by source
    if (filters.source === 'live') {
      entries = entries.filter(e => e.source !== 'history_import');
    } else if (filters.source === 'history') {
      entries = entries.filter(e => e.source === 'history_import');
    }
    // 'both' = no filter

    // Step 4: Filter by minimum active time
    if (filters.minActiveMinutes && filters.minActiveMinutes > 0) {
      const minActiveMs = filters.minActiveMinutes * 60000;
      entries = entries.filter(e => (e.activeTime || 0) >= minActiveMs);
    }

    // Step 5: Filter by minimum visit count
    if (filters.minVisitCount && filters.minVisitCount > 1) {
      entries = entries.filter(e => (e.visitCount || 1) >= filters.minVisitCount);
    }

    // Step 6: Check if empty and determine reason
    if (entries.length === 0) {
      let emptyReason = 'no_data_at_all';

      if (hadEntriesBeforeDomainFilter && !hadEntriesAfterDomainFilter) {
        emptyReason = 'no_data_for_domain';
      } else if (hadEntriesBeforeDomainFilter) {
        emptyReason = 'no_data_for_range';
      }

      return {
        entries: [],
        tabs: [],
        isEmpty: true,
        emptyReason,
        emptyMessage: EMPTY_MESSAGES[emptyReason],
        domains: filters.domains || []
      };
    }

    // Step 7: Token budget - limit to 50 entries
    if (entries.length > 50) {
      // Sort by activeTime descending, take top 50
      entries.sort((a, b) => (b.activeTime || 0) - (a.activeTime || 0));
      entries = entries.slice(0, 50);
    }

    // Step 8: Fetch tabs if requested
    let tabs = [];
    if (filters.includeTabs) {
      try {
        const tabsData = await chrome.tabs.query({});
        tabs = tabsData.map(t => ({
          title: t.title,
          url: t.url,
          active: t.active
        }));
      } catch (error) {
        console.error('[customTemplateRunner] Error fetching tabs:', error);
        tabs = [];
      }
    }

    // Return success
    return {
      entries,
      tabs,
      isEmpty: false,
      config: filters
    };

  } catch (error) {
    console.error('[buildCustomGatherer] Error:', error);
    // Return empty on error
    return {
      entries: [],
      tabs: [],
      isEmpty: true,
      emptyReason: 'no_data_at_all',
      emptyMessage: EMPTY_MESSAGES.no_data_at_all,
      domains: []
    };
  }
}
