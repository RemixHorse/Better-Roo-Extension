const SESSION_KEY = 'br-schema-banner-dismissed';
const BANNER_ID = 'better-roo-schema-banner';

export function showSchemaBanner() {
  if (sessionStorage.getItem(SESSION_KEY)) return;
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '2147483647',
    background: '#fff3cd',
    borderBottom: '2px solid #e6a817',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    color: '#664d03',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  });

  const msg = document.createElement('span');
  msg.textContent = 'Better Roo: Deliveroo’s page structure has changed — some features may not work. Check for an extension update.';

  const dismiss = document.createElement('button');
  dismiss.textContent = '×';
  Object.assign(dismiss.style, {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    lineHeight: '1',
    cursor: 'pointer',
    color: '#664d03',
    padding: '0 0 0 16px',
    flexShrink: '0',
  });
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.addEventListener('click', () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    banner.remove();
  });

  banner.appendChild(msg);
  banner.appendChild(dismiss);
  document.body.prepend(banner);
}
