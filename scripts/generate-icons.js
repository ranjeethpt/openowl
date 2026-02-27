/**
 * Generate PNG icons from SVG sources
 * Uses two versions:
 * - icon-small.svg for 16px and 32px (simplified, high contrast)
 * - icon.svg for 48px and 128px (detailed)
 */

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const iconsDir = join(__dirname, '..', 'public', 'icons');
const smallSvgPath = join(iconsDir, 'icon-small.svg');
const largeSvgPath = join(iconsDir, 'icon.svg');

// Small sizes use simplified icon, large sizes use detailed icon
const iconConfig = [
  { size: 16, source: 'small' },
  { size: 32, source: 'small' },
  { size: 48, source: 'large' },
  { size: 128, source: 'large' }
];

async function generateIcons() {
  try {
    console.log('Reading SVG sources...');
    const smallSvgBuffer = readFileSync(smallSvgPath);
    const largeSvgBuffer = readFileSync(largeSvgPath);

    for (const { size, source } of iconConfig) {
      const svgBuffer = source === 'small' ? smallSvgBuffer : largeSvgBuffer;
      const outputPath = join(iconsDir, `icon${size}.png`);

      console.log(`Generating icon${size}.png from ${source} version...`);

      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ Created ${outputPath}`);
    }

    console.log('\n✅ All icons generated successfully!');
    console.log('  → icon16.png & icon32.png: simplified version (eyes only)');
    console.log('  → icon48.png & icon128.png: detailed version (full owl)');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
