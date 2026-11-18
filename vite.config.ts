import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  // YouTube Playables require every path in the build to be relative.
  base: './',
  plugins: [
    {
      // The tester build (src/platform/tester.ts) runs outside YouTube, on itch.io: no YouTube SDK.
      name: 'tester-without-youtube-sdk',
      transformIndexHtml: (html: string) => (mode === 'tester' ? html.replace(/\s*<script src="https:\/\/www\.youtube\.com\/game_api\/v1"><\/script>/, '') : html),
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
