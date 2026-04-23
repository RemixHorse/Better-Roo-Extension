import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync, readFileSync, rmSync, cpSync } from 'fs';
import { resolve } from 'path';

const root = process.cwd();
const BROWSER = process.env.BROWSER ?? 'chrome';
const outDir = resolve(root, `dist-${BROWSER}`);

// Browser-specific manifest overrides — merged on top of the base manifest at build time.
// Chrome needs nothing extra; all additions are Firefox-only.
const BROWSER_OVERRIDES = {
  chrome: {
    background: { service_worker: 'background.js', type: 'module' },
  },
  firefox: {
    // Firefox MV3 keeps background.service_worker behind a flag — use scripts array instead
    background: { scripts: ['background.js'] },
    permissions: ['storage', 'alarms', 'tabs'],
    browser_specific_settings: {
      gecko: {
        id: 'better-roo@remixhorse',
        strict_min_version: '109.0',
      },
    },
  },
};

const copyExtensionFiles = () => ({
  name: 'copy-extension-files',
  closeBundle() {
    mkdirSync(outDir, { recursive: true });

    // Fix and flatten popup.html (Vite nests it under src/popup/)
    const builtHtml = readFileSync(resolve(outDir, 'src/popup/popup.html'), 'utf-8');
    writeFileSync(resolve(outDir, 'popup.html'), builtHtml.replace('src="/popup.js"', 'src="popup.js"'));
    rmSync(resolve(outDir, 'src'), { recursive: true, force: true });

    // Copy icons
    cpSync(resolve(root, 'src/icons'), resolve(outDir, 'icons'), { recursive: true });

    // Write manifest: base + shared overrides + browser-specific overrides
    const base = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf-8'));
    const manifest = {
      ...base,
      ...BROWSER_OVERRIDES[BROWSER],
      content_scripts: [
        { matches: ['*://deliveroo.co.uk/*'], js: ['early.js'], run_at: 'document_start' },
        { matches: ['*://deliveroo.co.uk/*'], js: ['content.js'], run_at: 'document_end' },
      ],
      action: { ...base.action, default_popup: 'popup.html' },
    };
    writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  },
});

// Builds background service worker + popup as ES modules.
// Runs first — cleans outDir, writes manifest and icons.
// Content scripts are built separately via vite.content.config.js (IIFE format).
export default defineConfig({
  plugins: [copyExtensionFiles()],
  build: {
    outDir,
    minify: false,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(root, 'src/background/index.js'),
        popup:      resolve(root, 'src/popup/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
