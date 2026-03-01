# Contributing to OpenOwl

Thank you for your interest in contributing to OpenOwl! This document provides guidelines for contributing to the project.

## Adding a New Site Extractor

OpenOwl uses a **Strategy Pattern + Registry** architecture for site-specific content extraction. This makes it easy to add support for new websites.

### Step-by-Step Guide

1. **Create a new extractor file** in `src/content/extractors/sites/yoursite.js`

2. **Extend BaseSiteExtractor** and implement the required methods:

```javascript
import { BaseSiteExtractor } from '../base.js';

export class YourSiteExtractor extends BaseSiteExtractor {
  get domains() {
    return ['yoursite.com'];  // List of domains this extractor handles
  }

  get name() {
    return 'YourSite';  // Display name
  }

  extract() {
    try {
      // Extract content from the page
      const title = this.getText('h1', 300);
      const content = this.getText('.main-content', 800);

      return this.buildResult('yoursite_page', `${title}\n\n${content}`, {
        title
      });
    } catch (error) {
      console.error('YourSite extraction failed:', error);
      return this.buildFallbackResult(error.message);
    }
  }
}
```

3. **Register your extractor** in `src/content/extractors/registry.js`:

```javascript
// Add import
import { YourSiteExtractor } from './sites/yoursite.js';

// Add to EXTRACTORS array
const EXTRACTORS = [
  new GitHubExtractor(),
  new YourSiteExtractor(),  // <-- Add here
  // ... other extractors
];
```

4. **Test your extractor**:
   - Open a page from your target site
   - Open Chrome DevTools Console
   - Type: `chrome.runtime.sendMessage({type: 'READ_PAGE'}, console.log)`
   - Verify the extracted content looks correct

5. **Submit a pull request** with:
   - Your extractor file
   - Updated registry.js
   - A description of what sites/pages it handles
   - Example URLs where it works

### Helper Methods Available

The `BaseSiteExtractor` provides these helper methods:

- **`getText(selector, maxLength)`** - Get text from first matching element
- **`getMultiple(selector, maxLength)`** - Get text from all matching elements
- **`cleanText(text)`** - Clean and normalize text
- **`buildResult(type, content, metadata)`** - Build standardized result
- **`buildFallbackResult(reason)`** - Build error fallback

### Best Practices

1. **Never throw errors** - Always return a result, even if minimal
2. **Limit content length** - Max 2000 chars total (enforced by `buildResult`)
3. **Use semantic selectors** - Prefer stable selectors over fragile ones
4. **Handle multiple states** - Check URL paths for different page types
5. **Test edge cases** - Empty pages, loading states, errors

### Example: GitHub Extractor

See `src/content/extractors/sites/github.js` for a complete reference implementation that handles:
- Pull requests
- Issues
- Code files
- Repository pages

## Other Contributions

We welcome:
- Bug fixes
- Documentation improvements
- UI/UX enhancements
- Performance optimizations
- New features (please open an issue first to discuss)

## Development Setup

See [SETUP.md](./SETUP.md) for detailed development setup instructions.

## Questions?

Open an issue or start a discussion on GitHub!
