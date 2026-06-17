// Loader script — classic (non-module) content script that bootstraps the ES module.
// Firefox does not support "type": "module" in manifest content_scripts entries,
// so we use dynamic import() which works in all modern browsers from content scripts.
(async () => {
  try {
    await import(chrome.runtime.getURL('src/content/index.js'));
  } catch (err) {
    console.error('[Better Roo] Failed to load content module:', err);
  }
})();
