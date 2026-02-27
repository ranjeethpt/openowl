import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react({
      // Disable fast refresh preamble detection for Chrome extensions
      // @crxjs handles module loading differently
      jsxRuntime: 'automatic',
      jsxImportSource: undefined,
      // Skip preamble injection - not needed with @crxjs
      include: '**/*.{jsx,tsx}',
    }),
    crx({ manifest })
  ],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  },
  build: {
    rollupOptions: {
      // Ensure proper module output for Chrome extension
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});
