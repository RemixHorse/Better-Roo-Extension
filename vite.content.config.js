import { defineConfig } from 'vite';
import { resolve } from 'path';

const root = process.cwd();
const BROWSER = process.env.BROWSER ?? 'chrome';
const outDir = resolve(root, `dist-${BROWSER}`);

// Builds content scripts as IIFE bundles — fully self-contained, no import statements.
// Content scripts are loaded as regular scripts (not ES modules) so they cannot use
// import/export syntax. IIFE format inlines all dependencies into each output file.
// Run AFTER vite.config.js (which cleans outDir) so it adds to the existing output.
export default defineConfig({
  build: {
    outDir,
    minify: false,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        content: resolve(root, 'src/content/index.js'),
        early:   resolve(root, 'src/content/early.js'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
      },
    },
  },
});
