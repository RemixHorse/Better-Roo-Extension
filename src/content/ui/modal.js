const MODAL_ID = 'br-info-modal';

export function showInfoModal() {
  if (document.getElementById(MODAL_ID)) return;
  injectModalStyles();

  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  const box = document.createElement('div');
  box.className = 'br-modal-box';
  box.innerHTML = `
    <div class="br-modal-header">
      <span class="br-modal-title">Better Roo</span>
      <button class="br-modal-close" aria-label="Close">✕</button>
    </div>
    <div class="br-modal-body">
      <div class="br-modal-section">
        <div class="br-modal-section-icon">⚙️</div>
        <div>
          <div class="br-modal-section-title">Settings</div>
          <div class="br-modal-section-text">
            Click the Better Roo icon in your browser's extension bar to open the settings menu.
            From there you can toggle FSA hygiene badges, shared address badges, card image blurring,
            the number of card columns, table view as default, and auto-scan.
            You can also clear all cached data from the same menu.
          </div>
        </div>
      </div>
      <div class="br-modal-section">
        <div class="br-modal-section-icon">🧪</div>
        <div>
          <div class="br-modal-section-title">FSA Hygiene Ratings</div>
          <div class="br-modal-section-text">
            Ratings come from the UK Food Standards Agency and appear as a badge on each card.
            We look them up the first time you open a restaurant's menu — cards showing
            <span class="br-modal-pill">FSA ?</span> haven't had their menu opened yet.
            Tap any <span class="br-modal-pill">FSA ?</span> badge to open that menu and load its rating.
            <span class="br-modal-pill br-modal-pill--dash">FSA —</span> means we checked but no rating was found (e.g. exempt or not yet inspected).
          </div>
        </div>
      </div>
      <div class="br-modal-section">
        <div class="br-modal-section-icon">📍</div>
        <div>
          <div class="br-modal-section-title">Shared Address Detection</div>
          <div class="br-modal-section-text">
            If you've had a bad experience with one brand, or simply want to avoid an operator, you deserve to know when another listing is run by the same kitchen.<br>
            Some restaurants are virtual brands — different names and menus operating from the same kitchen.
            This is common with ghost kitchens, where a single operator lists multiple brands to appear
            as separate choices.
            A <span class="br-modal-pill" style="background:#FFD54F;color:#7F4900;">Shared Address</span> badge
            on a card means another restaurant on the listing shares the same address.
            Hover the badge to see which restaurants are co-located.<br><br>
            <strong>Note:</strong> address data is only available after you've opened a restaurant's menu at least once.
            The more menus you browse, the more matches we can surface.
          </div>
        </div>
      </div>
      <div class="br-modal-section">
        <div class="br-modal-section-icon">🔽</div>
        <div>
          <div class="br-modal-section-title">Filters</div>
          <div class="br-modal-section-text">
            Use the filter bar to narrow results by FSA score, Deliveroo rating,
            delivery time, or shared address status. In card view, non-matching
            restaurants are dimmed rather than removed so you keep the full picture.
          </div>
        </div>
      </div>
      <div class="br-modal-section">
        <div class="br-modal-section-icon">📋</div>
        <div>
          <div class="br-modal-section-title">Table View</div>
          <div class="br-modal-section-text">
            Switch to table view for a compact, sortable list of all restaurants —
            including FSA score, rating, and delivery time at a glance.
            Your preference is remembered between visits.
          </div>
        </div>
      </div>
      <div class="br-modal-section">
        <div class="br-modal-section-icon">🔒</div>
        <div>
          <div class="br-modal-section-title">Your Data Stays on Your Device</div>
          <div class="br-modal-section-text">
            Better Roo stores everything — restaurant data, hygiene ratings, address matches — locally in your browser.
            Nothing is ever sent to us or any third party. We have no servers, no analytics, no tracking, and no interest whatsoever in your data.
            The only external requests made are to the UK Food Standards Agency API to fetch hygiene ratings, and directly to Deliveroo as you browse normally.
          </div>
        </div>
      </div>
    </div>
    <div class="br-modal-footer">
      <button class="br-modal-btn">Got it</button>
    </div>
  `;

  box.querySelector('.br-modal-close').addEventListener('click', closeModal);
  box.querySelector('.br-modal-btn').addEventListener('click', closeModal);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.addEventListener('keydown', onKeyDown);
}

function closeModal() {
  document.getElementById(MODAL_ID)?.remove();
  document.removeEventListener('keydown', onKeyDown);
}

function onKeyDown(e) {
  if (e.key === 'Escape') closeModal();
}

function injectModalStyles() {
  if (document.getElementById('br-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'br-modal-styles';
  style.textContent = `
    #br-info-modal {
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .br-modal-box {
      background: #fff;
      border-radius: 16px;
      width: 630px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 120px);
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 40px rgba(0,0,0,0.2);
      overflow: hidden;
    }
    .br-modal-header {
      background: linear-gradient(to right, #00CCBC, #00CC9A);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .br-modal-title {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.2px;
    }
    .br-modal-close {
      background: none;
      border: none;
      color: rgba(255,255,255,0.8);
      font-size: 16px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .br-modal-close:hover { color: #fff; }
    .br-modal-body {
      padding: 8px 20px;
      overflow-y: auto;
      flex: 1;
    }
    .br-modal-section {
      display: flex;
      gap: 14px;
      padding: 14px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .br-modal-section:last-child { border-bottom: none; }
    .br-modal-section-icon {
      font-size: 22px;
      line-height: 1;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .br-modal-section-title {
      font-size: 13px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 4px;
    }
    .br-modal-section-text {
      font-size: 12px;
      color: #555;
      line-height: 1.5;
    }
    .br-modal-pill {
      display: inline-block;
      background: #F5F5F5;
      color: #424242;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 999px;
      font-family: sans-serif;
      vertical-align: middle;
    }
    .br-modal-pill--dash { color: #888; }
    .br-modal-footer {
      padding: 12px 20px 16px;
      display: flex;
      justify-content: flex-end;
      flex-shrink: 0;
      border-top: 1px solid #f0f0f0;
    }
    .br-modal-btn {
      background: linear-gradient(to right, #00CCBC, #00CC9A);
      color: #fff;
      border: none;
      border-radius: 999px;
      padding: 8px 24px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
    }
    .br-modal-btn:hover { opacity: 0.9; }
  `;
  document.head.appendChild(style);
}
