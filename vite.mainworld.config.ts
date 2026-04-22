import { defineConfig } from "vite";
import path from "path";

// Build the MAIN-world content script as a standalone IIFE.
// No React needed here — pure DOM manipulation.
export default defineConfig({
  build: {
    outDir: "dist/assets",
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/content/mainWorld.ts"),
      name: "ChessiroMainWorld",
      fileName: () => "mainWorld.js",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  publicDir: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
