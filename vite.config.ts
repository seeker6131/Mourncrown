import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 0,
    rollupOptions: mode === 'single' ? {} : { output: { manualChunks: { phaser: ['phaser'] } } },   // the engine rarely changes: players keep it cached when the game updates
  },
}));
