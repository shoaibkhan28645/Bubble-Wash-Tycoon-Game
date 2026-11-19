import { defineConfig } from 'vitest/config';

/** index.html's YouTube SDK script (and the comment above it). */
const YOUTUBE_SDK = /\s*(<!--[^>]*-->\s*)?<script src="https:\/\/www\.youtube\.com\/game_api\/v1"><\/script>/;

export default defineConfig(({ mode }) => ({
  // YouTube Playables require every path in the build to be relative.
  base: './',
  plugins: [
    {
      // The tester build (src/platform/tester.ts) runs outside YouTube, on itch.io: no YouTube SDK.
      // The Playgama build (src/platform/playgama.ts) loads Playgama Bridge instead, as the page's
      // first script, loaded normally (its Required step 2); scripts/build-playgama.mjs puts the
      // script and its config next to index.html.
      name: 'platform-sdk',
      transformIndexHtml: (html: string) => {
        if (mode === 'tester') return html.replace(YOUTUBE_SDK, '');
        if (mode !== 'playgama') return html;
        return html.replace(YOUTUBE_SDK, '').replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n    <script src="./playgama-bridge.js"></script>');
      },
    },
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Warn at YouTube's 512 KiB per-file target (Vite counts in kB).
    chunkSizeWarningLimit: 524,
    rollupOptions: {
      output: {
        // Three.js in its own files so game changes don't touch them, split
        // along its own core / renderer boundary to stay under 512 KiB each.
        manualChunks(id) {
          if (id.includes('node_modules/three/build/three.core')) return 'three-core';
          if (id.includes('node_modules/three/')) return 'three-render';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
