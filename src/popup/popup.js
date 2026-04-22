const DEFAULT_SETTINGS = { hygieneEnabled: true, sharedAddressEnabled: true, tableViewDefault: false, hidePromotionalGroups: true, blurCardImages: false };

async function getSettings() {
  return chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
}

async function saveSettings(patch) {
  const merged = await chrome.runtime.sendMessage({ type: 'SET_SETTINGS', patch });
  // Broadcast to all active Deliveroo tabs
  const tabs = await chrome.tabs.query({ url: '*://deliveroo.co.uk/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_CHANGED', settings: merged }).catch(() => {});
  }
  return merged;
}

async function init() {
  // Version
  const manifest = chrome.runtime.getManifest();
  document.getElementById('br-version').textContent = `v${manifest.version}`;

  // Stats from chrome.storage.local (written by content script)
  const { brStats } = await chrome.storage.local.get({ brStats: null });
  const statsEl = document.getElementById('br-stats');
  if (brStats) {
    const when = brStats.lastUpdated
      ? `· updated ${relativeTime(brStats.lastUpdated)}`
      : '';
    statsEl.innerHTML = `<strong>${brStats.restaurantCount}</strong> restaurants tracked ${when}`;
  } else {
    statsEl.textContent = 'No data yet — visit a Deliveroo listing page.';
  }

  // Settings → toggles
  const settings = await getSettings();

  const hygieneToggle = document.getElementById('toggle-hygiene');
  const sharedToggle  = document.getElementById('toggle-shared');
  const tableToggle   = document.getElementById('toggle-table');
  const promoToggle   = document.getElementById('toggle-promo');
  const blurToggle    = document.getElementById('toggle-blur');

  hygieneToggle.checked = settings.hygieneEnabled;
  sharedToggle.checked  = settings.sharedAddressEnabled;
  tableToggle.checked   = settings.tableViewDefault;
  promoToggle.checked   = settings.hidePromotionalGroups;
  blurToggle.checked    = settings.blurCardImages;

  hygieneToggle.addEventListener('change', () =>
    saveSettings({ hygieneEnabled: hygieneToggle.checked })
  );
  sharedToggle.addEventListener('change', () =>
    saveSettings({ sharedAddressEnabled: sharedToggle.checked })
  );
  tableToggle.addEventListener('change', () =>
    saveSettings({ tableViewDefault: tableToggle.checked })
  );
  promoToggle.addEventListener('change', () =>
    saveSettings({ hidePromotionalGroups: promoToggle.checked })
  );
  blurToggle.addEventListener('change', () =>
    saveSettings({ blurCardImages: blurToggle.checked })
  );

  // Clear data
  document.getElementById('btn-clear').addEventListener('click', async () => {
    const btn = document.getElementById('btn-clear');
    const feedback = document.getElementById('br-feedback');
    btn.disabled = true;
    btn.textContent = 'Clearing…';

    const tabs = await chrome.tabs.query({ url: '*://deliveroo.co.uk/*' });
    for (const tab of tabs) {
      await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_DATA' }).catch(() => {});
    }
    await chrome.storage.local.remove('brStats');

    statsEl.textContent = 'No data yet — visit a Deliveroo listing page.';
    btn.textContent = 'Clear all cached data';
    btn.disabled = false;
    feedback.textContent = 'Data cleared.';
    setTimeout(() => { feedback.textContent = ''; }, 2500);
  });
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

init();
