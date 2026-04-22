import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync, readFileSync, rmSync, cpSync } from 'fs';
import { resolve } from 'path';

const root = process.cwd();

const copyExtensionFiles = () => ({
  name: 'copy-extension-files',
  closeBundle() {
    mkdirSync(resolve(root, 'dist'), { recursive: true });

    // Fix and flatten popup.html
    const builtHtml = readFileSync(resolve(root, 'dist/src/popup/popup.html'), 'utf-8');
    writeFileSync(resolve(root, 'dist/popup.html'), builtHtml.replace('src="/popup.js"', 'src="popup.js"'));
    rmSync(resolve(root, 'dist/src'), { recursive: true, force: true });

    // Copy icons
    cpSync(resolve(root, 'src/icons'), resolve(root, 'dist/icons'), { recursive: true });

    // Write corrected manifest
    const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf-8'));
    manifest.content_scripts = [
      { matches: ['*://deliveroo.co.uk/*'], js: ['content.js'], run_at: 'document_end' },
    ];
    manifest.background.service_worker = 'background.js';
    manifest.action.default_popup = 'popup.html';
    writeFileSync(resolve(root, 'dist/manifest.json'), JSON.stringify(manifest, null, 2));
  },
});

export default defineConfig({
  plugins: [copyExtensionFiles()],
  build: {
    outDir: resolve(root, 'dist'),
    minify: false,
    rollupOptions: {
      input: {
        content: resolve(root, 'src/content/index.js'),
        background: resolve(root, 'src/background/index.js'),
        popup: resolve(root, 'src/popup/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
