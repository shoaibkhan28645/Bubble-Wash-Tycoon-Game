import { defineConfig } from 'vitest/config';

export default defineConfig({
  // YouTube Playables require every path in the build to be relative.
  base: './',
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
});
