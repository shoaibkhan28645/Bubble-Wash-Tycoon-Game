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
        // Keep Three.js in its own file so game code changes don't touch it.
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
