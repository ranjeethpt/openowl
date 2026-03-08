/**
 * Memory Search - Local keyword extraction and scoring
 * No LLM involved - fast local search across 30 days of history
 */

/**
 * @typedef {import('../storage/index.js').DayLogEntry} DayLogEntry
 */

/**
 * Extract keywords from a question for memory search
 * @param {string} question - User's question
 * @returns {string[]} Array of keywords and phrases
 */
export function extractKeywords(question) {
  const stopWords = [
    'i', 'the', 'a', 'an', 'was', 'were',
    'looking', 'at', 'some', 'remember', 'find',
    'cant', 'something', 'thing', 'it', 'about',
    'what', 'that', 'this', 'had', 'to', 'me',
    'of', 'for', 'on', 'in', 'is', 'my', 'and',
    'remind', 'please', 'can', 'you', 'help'
  ];

  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(' ')
    .filter(w => w.length > 2)
    .filter(w => !stopWords.includes(w));

  // Two-word phrases as well
  const phrases = [];
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
  }

  return [...new Set([...words, ...phrases])];
}

/**
 * Search through all logs for entries matching keywords
 * @param {string} question - User's question
 * @param {() => Promise<DayLogEntry[]>} getAllLogs - Function to get all logs
 * @returns {Promise<DayLogEntry[]>} Top 8 scored entries
 */
export async function searchMemory(question, getAllLogs) {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return [];

  const allLogs = await getAllLogs(); // all 30 days

  const scored = allLogs.map(entry => {
    let score = 0;

    keywords.forEach(kw => {
      // Title match = high value
      if (entry.title?.toLowerCase().includes(kw))
        score += 10;

      // URL match = high value
      if (entry.url?.toLowerCase().includes(kw))
        score += 8;

      // Copied match = highest value
      // User deliberately copied = important
      if (entry.copied?.some(c => c.text.toLowerCase().includes(kw)))
        score += 15;

      // Content match = medium value
      if (entry.content?.toLowerCase().includes(kw))
        score += 5;
    });

    if (score === 0) return { ...entry, score };

    // Recency boost (newer = more relevant)
    const daysAgo = (Date.now() - Number(entry.visitedAt))
                    / (1000 * 60 * 60 * 24);
    score += Math.max(0, 10 - daysAgo);

    // Engagement boost
    if (entry.activeTime > 60000)  score += 3;
    if (entry.activeTime > 300000) score += 7;

    // Visit count boost (kept coming back = important)
    score += Math.min(entry.visitCount || 1, 5);

    return { ...entry, score };
  });

  return scored
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8); // top 8 only — LLM gets these
}
