# OpenOwl Icons

Professional owl icon set for the OpenOwl Chrome extension.

## Files

### Source SVGs
- `icon-small.svg` - Simplified version for small sizes (32x32)
- `icon.svg` - Detailed version for large sizes (128x128)

### Generated PNGs
- `icon16.png` - 16x16px (toolbar icon) - **uses simplified version**
- `icon32.png` - 32x32px (toolbar icon @2x) - **uses simplified version**
- `icon48.png` - 48x48px (extension management) - **uses detailed version**
- `icon128.png` - 128x128px (Chrome Web Store) - **uses detailed version**

## Design Philosophy

**Two versions for optimal clarity:**

### Small Sizes (16px, 32px)
- **Simplified:** Just two eyes (white circles with blue pupils)
- **High contrast:** White on dark navy (#0f172a)
- **No details:** No body, beak, or wings
- **Crisp rendering:** Avoids blur at tiny sizes
- **Instantly recognizable:** Clear owl eyes

### Large Sizes (48px, 128px)
- **Detailed:** Full owl body with wings
- **Style:** Minimal, flat design
- **Colors:**
  - Background: Dark navy (#0f172a)
  - Owl body: Slate (#1e293b, #334155)
  - Eyes: White with blue accent (#2563eb)
  - Beak: Amber (#f59e0b)

## Regenerating Icons

If you modify either SVG, regenerate all PNG sizes:

```bash
npm run generate-icons
```

This script:
- Uses `icon-small.svg` for 16px and 32px
- Uses `icon.svg` for 48px and 128px
- Converts using Sharp library for high quality

## Icon Requirements (Chrome Extensions)

- 16x16: Toolbar icon (standard density)
- 32x32: Toolbar icon (high density)
- 48x48: Extension management page
- 128x128: Chrome Web Store listing

All icons must be PNG format with proper dimensions.
