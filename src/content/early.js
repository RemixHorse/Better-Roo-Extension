// Runs at document_start — before any page JS executes.
// Hides the card grid immediately if table mode is cached in sessionStorage,
// preventing the flash of Deliveroo's card skeleton when table is the default view.
// Wrapped in an IIFE so top-level variables don't leak into Firefox's shared content-script scope.
;(() => {
  const GRID_SELECTOR = '[class*="HomeFeedGrid"]:not([class*="HomeFeedGrid-f"])';

  if (
    sessionStorage.getItem('br-table-mode') === '1' &&
    window.location.pathname.startsWith('/restaurants/')
  ) {
    const style = document.createElement('style');
    style.id = 'better-roo-grid-hide';
    style.textContent = `${GRID_SELECTOR} { display: none !important; }`;
    document.documentElement.appendChild(style);
  }
})();
