import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// Separate build config for the content script.
// Content scripts run as classic (non-module) scripts in Chrome extensions,
// so we MUST output as IIFE — not ES module format.
export default defineConfig({
  plugins: [react()],
  define: {
    // React needs this set for production builds
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist/assets',
    emptyOutDir: false,         // don't wipe the popup assets
    lib: {
      entry: path.resolve(__dirname, 'src/content/index.tsx'),
      name: 'ChessiroExtension',
      fileName: () => 'content.js', // always output as content.js
      formats: ['iife'],            // IIFE = no import/export, runs inline
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,  // bundle everything into one file
      },
    },
  },
  publicDir: false, // Prevents copying the public directory again (e.g., manifest.json)

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
