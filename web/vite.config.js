import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// One JS file and one CSS file, with every font, image and icon inlined. scripts/embed-web.mjs then takes the fonts out
// as woff2 files, and the Worker serves all three at hashed /_app/ paths, cached for a year (#351).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {output: {entryFileNames: 'app.js', assetFileNames: 'app[extname]', codeSplitting: false}},
  },
  server: {proxy: {'/api': 'http://localhost:8787'}},
});
