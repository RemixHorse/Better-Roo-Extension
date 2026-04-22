import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync, readFileSync, rmSync, cpSync } from 'fs';
import { resolve } from 'path';

const root = process.cwd();
const BROWSER = process.env.BROWSER ?? 'chrome';
const outDir = resolve(root, `dist-${BROWSER}`);

// Browser-specific manifest overrides — merged on top of the base manifest at build time.
// Chrome needs nothing extra; all additions are Firefox-only.
const BROWSER_OVERRIDES = {
  chrome: {},
  firefox: {
    permissions: ['storage', 'alarms', 'tabs'],
    browser_specific_settings: {
      gecko: {
        id: 'better-roo@remixhorse',
        strict_min_version: '128.0',
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
      background: { service_worker: 'background.js', type: 'module' },
      action: { ...base.action, default_popup: 'popup.html' },
    };
    writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  },
});

export default defineConfig({
  plugins: [copyExtensionFiles()],
  build: {
    outDir,
    minify: false,
    rollupOptions: {
      input: {
        content:    resolve(root, 'src/content/index.js'),
        early:      resolve(root, 'src/content/early.js'),
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
