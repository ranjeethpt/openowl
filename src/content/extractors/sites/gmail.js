/**
 * GmailExtractor - Extract content from Gmail
 *
 * Handles:
 * - Open email view
 * - Inbox/list view (returns summary)
 */

import { BaseSiteExtractor } from '../base.js';

export class GmailExtractor extends BaseSiteExtractor {
  get domains() {
    return ['mail.google.com'];
  }

  get name() {
    return 'Gmail';
  }

  extract() {
    try {
      // Check if an email is currently open
      const isEmailOpen = this.isEmailOpen();

      if (isEmailOpen) {
        return this.extractOpenEmail();
      } else {
        return this.extractInboxView();
      }
    } catch (error) {
      console.error('Gmail extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }

  /**
   * Check if an email is currently open (not just inbox view)
   */
  isEmailOpen() {
    // Gmail shows email body when an email is open
    const emailBody = document.querySelector('[data-message-id]') ||
                      document.querySelector('.a3s') ||
                      document.querySelector('[role="main"] [role="article"]');

    return !!emailBody;
  }

  /**
   * Extract open email details
   */
  extractOpenEmail() {
    // Subject line
    const subject = this.getText('h2[data-legacy-thread-id]', 300) ||
                    this.getText('.hP', 300) ||
                    this.getText('[role="heading"]', 300);

    // Sender information
    const sender = this.getText('.gD', 100) ||
                   this.getText('.go', 100) ||
                   this.getText('[email]', 100);

    const senderEmail = this.getText('.gD[email]', 100) ||
                        this.getText('.go[email]', 100);

    // Email body (first 500 chars)
    const body = this.getText('.a3s', 500) ||
                 this.getText('[data-message-id] .a3s', 500) ||
                 this.getText('.ii', 500);

    // Date
    const date = this.getText('.g3', 100) ||
                 this.getText('[data-tooltip*="GMT"]', 100);

    const content = `
Subject: ${subject}

From: ${sender}${senderEmail ? ` <${senderEmail}>` : ''}

Date: ${date || 'Unknown'}

Message:
${body}
    `.trim();

    return this.buildResult('gmail_email', content, {
      subject,
      sender,
      senderEmail: senderEmail || 'unknown',
      date: date || 'unknown'
    });
  }

  /**
   * Extract inbox view summary
   */
  extractInboxView() {
    // Get visible email subjects in inbox
    const emailSubjects = this.getMultiple('[role="main"] .zA', 100).slice(0, 10);

    let content;

    if (emailSubjects.length > 0) {
      content = `Gmail inbox - ${emailSubjects.length} visible emails:\n\n` +
                emailSubjects.map((subject, i) => `${i + 1}. ${subject}`).join('\n');
    } else {
      content = 'Gmail inbox - no email currently open';
    }

    return this.buildResult('gmail_inbox', content, {
      emailCount: emailSubjects.length
    });
  }
}
