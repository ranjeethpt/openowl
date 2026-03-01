/**
 * CalendarExtractor - Extract content from Google Calendar
 *
 * Handles:
 * - Today's events
 * - Currently selected/open event
 * - Next upcoming event
 */

import { BaseSiteExtractor } from '../base.js';

export class CalendarExtractor extends BaseSiteExtractor {
  get domains() {
    return ['calendar.google.com'];
  }

  get name() {
    return 'Google Calendar';
  }

  extract() {
    try {
      // Check if an event is currently open in detail view
      const openEvent = this.extractOpenEvent();
      if (openEvent) {
        return openEvent;
      }

      // Otherwise, extract today's schedule
      return this.extractTodaySchedule();
    } catch (error) {
      console.error('Calendar extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }

  /**
   * Extract currently open event details
   */
  extractOpenEvent() {
    // Check if event details popup is open
    const eventTitle = this.getText('[data-event-title]', 300) ||
                       this.getText('[role="dialog"] [data-is-event-title="true"]', 300);

    if (!eventTitle) {
      return null;
    }

    const eventTime = this.getText('[data-is-time="true"]', 100) ||
                      this.getText('[role="dialog"] [data-start-time]', 100);

    const eventLocation = this.getText('[data-is-location="true"]', 200) ||
                          this.getText('[role="dialog"] [data-location]', 200);

    const eventDescription = this.getText('[data-is-description="true"]', 400) ||
                             this.getText('[role="dialog"] [aria-label*="description"]', 400);

    const content = `
Event: ${eventTitle}

Time: ${eventTime || 'N/A'}

Location: ${eventLocation || 'N/A'}

Description:
${eventDescription || 'No description'}
    `.trim();

    return this.buildResult('calendar_event', content, {
      eventTitle,
      eventTime: eventTime || 'N/A',
      eventLocation: eventLocation || 'N/A'
    });
  }

  /**
   * Extract today's schedule from calendar view
   */
  extractTodaySchedule() {
    // Get visible events from today
    const events = this.extractVisibleEvents();

    if (events.length === 0) {
      return this.buildResult('calendar_schedule', 'No events scheduled for today', {
        eventCount: 0
      });
    }

    const content = `Today's schedule:\n\n${events.join('\n')}`;

    // Try to identify next upcoming event
    const now = new Date();
    const nextEvent = this.findNextEvent(events, now);

    return this.buildResult('calendar_schedule', content, {
      eventCount: events.length,
      nextEvent: nextEvent || 'No upcoming events'
    });
  }

  /**
   * Extract visible events from calendar grid
   */
  extractVisibleEvents() {
    const events = [];

    // Try different selectors for calendar events
    const eventSelectors = [
      '[data-eventchip]',
      '[data-draggable-id]',
      '[role="button"][data-eventid]',
      '[data-event-id]'
    ];

    for (const selector of eventSelectors) {
      const eventElements = document.querySelectorAll(selector);

      if (eventElements.length > 0) {
        eventElements.forEach((el, index) => {
          if (index < 20) { // Limit to 20 events
            const eventText = this.cleanText(el.innerText || el.textContent || '');
            if (eventText && eventText.length > 0) {
              events.push(eventText);
            }
          }
        });
        break; // Found events, stop trying selectors
      }
    }

    // Format events if they have times
    return events.map((event) => {
      // Add bullet point if not already formatted
      if (!event.match(/^\d+:/) && !event.match(/^•/)) {
        return `• ${event}`;
      }
      return event;
    });
  }

  /**
   * Find next upcoming event (simple heuristic based on time strings)
   */
  findNextEvent(events) {
    // This is a simple heuristic - looks for first event with a time in the future
    // More sophisticated logic could parse actual times
    for (const event of events) {
      // If event contains time pattern like "2:00pm" or "14:00"
      if (event.match(/\d+:\d+/)) {
        return event;
      }
    }
    return null;
  }
}
