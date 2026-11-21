import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** every build gets its own id: the game knows its own, version.json on the site says the newest (core/update.ts) */
const BUILD = Date.now().toString(36);
const versionFile = (): Plugin => ({ name: 'version-file', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ b: BUILD }) }); } });

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: mode === 'single' ? [viteSingleFile()] : [versionFile()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 0,
  },
}));
