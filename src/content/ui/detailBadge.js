import { getFsaCache } from '../db.js';
import { timeAgo } from '../timeAgo.js';

export async function injectDetailBadge(restaurant, fsaRating) {
  // Skip if Deliveroo already renders their own hygiene block in the DOM
  if (document.querySelector('[data-testid="layout-list-hygiene-rating"]')) return;

  // If no rating was found in __NEXT_DATA__, try the IndexedDB cache
  if (!fsaRating) {
    const cached = await getFsaCache(restaurant.id);
    if (cached?.score != null) {
      fsaRating = { score: cached.score, ratingDate: cached.ratingDate };
    }
  }

  // Wait for the MenuHeader info container (identified by its MenuHeaderTitle child)
  const titleEl = await waitForElement('[class*="MenuHeaderTitle"]', 5000);
  if (!titleEl) return;
  const infoContainer = titleEl.parentElement;

  document.getElementById('br-detail-fsa')?.remove();
  injectStyles();

  const item = buildItem(fsaRating);

  // Insert after the "Allergens and info" sibling if present, otherwise append
  const allergenDiv = Array.from(infoContainer.children).find(
    c => c.textContent.trim() === 'Allergens and info'
  );
  if (allergenDiv) {
    allergenDiv.insertAdjacentElement('afterend', item);
  } else {
    infoContainer.appendChild(item);
  }
}

function buildItem(fsaRating) {
  const wrap = document.createElement('div');
  wrap.id = 'br-detail-fsa';

  const score = fsaRating?.score ?? null;
  const { bg, text } = score != null ? fsaScoreColor(score) : { bg: '#F5F5F5', text: '#999' };

  const pill = document.createElement('span');
  pill.className = 'br-detail-fsa-pill';
  pill.style.backgroundColor = bg;
  pill.style.color = text;
  pill.textContent = score != null ? `FSA ${score}/5` : 'FSA ?';
  wrap.appendChild(pill);

  if (score != null && fsaRating?.ratingDate) {
    const sep = document.createElement('span');
    sep.className = 'br-detail-fsa-sep';
    sep.textContent = '·';
    wrap.appendChild(sep);

    const date = document.createElement('span');
    date.className = 'br-detail-fsa-meta';
    date.textContent = `Last inspected ${timeAgo(fsaRating.ratingDate)}`;
    wrap.appendChild(date);
  } else if (score == null) {
    const sep = document.createElement('span');
    sep.className = 'br-detail-fsa-sep';
    sep.textContent = '·';
    wrap.appendChild(sep);

    const note = document.createElement('span');
    note.className = 'br-detail-fsa-meta';
    note.textContent = 'No hygiene rating on record';
    wrap.appendChild(note);
  }

  return wrap;
}

function fsaScoreColor(score) {
  if (score >= 5) return { bg: '#81C784', text: '#1B5E20' };
  if (score >= 4) return { bg: '#4DB6AC', text: '#004D40' };
  if (score >= 3) return { bg: '#FFD54F', text: '#7F4900' };
  if (score >= 2) return { bg: '#FFB74D', text: '#7A2E00' };
  return           { bg: '#E57373', text: '#7F0000' };
}

function waitForElement(selector, timeoutMs) {
  const el = document.querySelector(selector);
  if (el) return Promise.resolve(el);
  return new Promise(resolve => {
    const obs = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { obs.disconnect(); resolve(found); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
  });
}

function injectStyles() {
  if (document.getElementById('br-detail-fsa-styles')) return;
  const style = document.createElement('style');
  style.id = 'br-detail-fsa-styles';
  style.textContent = `
    #br-detail-fsa {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-family: sans-serif;
    }
    .br-detail-fsa-pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }
    .br-detail-fsa-sep {
      color: #ccc;
      font-size: 13px;
    }
    .br-detail-fsa-meta {
      font-size: 13px;
      color: #666;
    }
  `;
  document.head.appendChild(style);
}
