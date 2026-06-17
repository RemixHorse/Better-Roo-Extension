/**
 * Unbundled build script — copies source files directly into dist-{browser}/
 * with no bundling, minification, or code transformation.
 *
 * Usage:
 *   BROWSER=chrome node scripts/build-unbundled.js
 *   BROWSER=firefox node scripts/build-unbundled.js
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = process.cwd();
const BROWSER = process.env.BROWSER ?? 'chrome';
const outDir = resolve(root, `dist-${BROWSER}`);

// Clean output directory
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Copy source files (preserving directory structure)
cpSync(resolve(root, 'src'), resolve(outDir, 'src'), {
  recursive: true,
  filter: (src) => !src.includes('src\\data') && !src.includes('src/data'),
});

// Copy icons to top-level (manifest references icons/*)
cpSync(resolve(root, 'src/icons'), resolve(outDir, 'icons'), { recursive: true });

// Generate manifest
const base = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf-8'));

const BROWSER_OVERRIDES = {
  chrome: {
    background: { service_worker: 'src/background/index.js', type: 'module' },
  },
  firefox: {
    background: { scripts: ['src/background/index.js'], type: 'module' },
    permissions: ['storage', 'alarms', 'tabs'],
    browser_specific_settings: {
      gecko: {
        id: 'better-roo@remixhorse',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
          optional: [],
        },
      },
    },
  },
};

const manifest = {
  ...base,
  ...BROWSER_OVERRIDES[BROWSER],
  content_scripts: [
    {
      matches: ['*://deliveroo.co.uk/*'],
      js: ['src/content/early.js'],
      run_at: 'document_start',
    },
    {
      matches: ['*://deliveroo.co.uk/*'],
      js: ['src/content/index.js'],
      type: 'module',
      run_at: 'document_end',
      world: 'ISOLATED',
    },
  ],
  action: { ...base.action, default_popup: 'src/popup/popup.html' },
};

writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`Built unbundled ${BROWSER} extension → ${outDir}`);
