// Runs at document_start — before any page JS executes.
// Always hides Deliveroo's card grid on listing pages so neither the skeleton
// nor the real grid ever flashes before our custom card grid or table renders.
// Wrapped in an IIFE so top-level variables don't leak into Firefox's shared content-script scope.
;(() => {
  if (!window.location.pathname.startsWith('/restaurants/')) return;
  const style = document.createElement('style');
  style.id = 'better-roo-grid-hide';
  style.textContent = '[class*="HomeFeedGrid"]:not([class*="HomeFeedGrid-f"]) { display: none !important; }';
  document.documentElement.appendChild(style);
})();
