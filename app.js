/* Opportunity Scout — frontend logic */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/* ------------------------------- state ------------------------------- */
const state = {
  items: [],
  tab: 'all',
  topics: new Set(),
  mode: 'feed',            // 'feed' | 'search'
  query: '',
  updatedAt: null,
  sourceStatus: [],
  loading: false
};

const SAVED_KEY = 'os_saved_v1';
const TOKEN_KEY = 'os_x_token';

const saved = (() => {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(SAVED_KEY) || '{}'))); }
  catch { return new Map(); }
})();

function persistSaved() {
  localStorage.setItem(SAVED_KEY, JSON.stringify(Object.fromEntries(saved)));
  updateSavedCount();
}

/* ------------------------------ helpers ------------------------------ */
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function timeAgo(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!t) return null;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 4200);
}

const TOPIC_META = {
  crypto: ['🪙', 'Crypto'],
  jobs: ['💻', 'Jobs'],
  business: ['🏪', 'Business'],
  grants: ['🎓', 'Grants'],
  microtasks: ['🧩', 'Microtasks']
};

/* ------------------------------ fetching ------------------------------ */
async function loadFeed(force = false) {
  if (state.loading) return;
  state.loading = true;
  state.mode = 'feed';
  $('#search-banner').classList.add('hidden');
  showSkeleton();
  hideError();
  try {
    const res = await fetch('/api/opportunities', { cache: force ? 'reload' : 'default' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.items = data.items || [];
    state.updatedAt = data.updatedAt;
    state.sourceStatus = data.sourceStatus || [];
    renderStats();
    render();
    updateUpdatedLabel();
    maybeMergeXApi();
  } catch (e) {
    showError(`Could not load opportunities: ${esc(e.message)}. <button class="btn" onclick="window.__retry()">Retry</button>`);
    render();
  } finally {
    state.loading = false;
  }
}
window.__retry = () => loadFeed(true);

async function runSearch(q) {
  state.loading = true;
  state.mode = 'search';
  state.query = q;
  $('#search-term').textContent = q;
  $('#search-banner').classList.remove('hidden');
  showSkeleton();
  hideError();
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.items = data.items || [];
    state.sourceStatus = data.sourceStatus || [];
    renderStats();
    render();
  } catch (e) {
    showError(`Search failed: ${esc(e.message)}`);
    render();
  } finally {
    state.loading = false;
  }
}

async function maybeMergeXApi() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token || state.mode !== 'feed') return;
  try {
    const res = await fetch('/api/x-direct', { headers: { 'x-x-bearer': token } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const known = new Set(state.items.map(i => i.url));
    const fresh = (data.items || []).filter(i => !known.has(i.url));
    if (fresh.length) {
      state.items = [...fresh, ...state.items];
      renderStats();
      render();
    }
    toast(`🐦 Direct X search merged ${fresh.length} new post${fresh.length === 1 ? '' : 's'}`);
  } catch (e) {
    toast(`X API: ${e.message}`, true);
  }
}

/* ------------------------------ rendering ------------------------------ */
function showSkeleton() {
  $('#cards').innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('');
  $('#empty').classList.add('hidden');
  $('#loading-note')?.classList.remove('hidden');
}

function showError(html) {
  const el = $('#error-banner');
  el.innerHTML = html;
  el.classList.remove('hidden');
}
function hideError() { $('#error-banner').classList.add('hidden'); }

function updateUpdatedLabel() {
  const el = $('#updated-label');
  if (!state.updatedAt) { el.textContent = '—'; return; }
  const min = Math.max(0, Math.round((Date.now() - Date.parse(state.updatedAt)) / 60000));
  el.textContent = min === 0 ? 'Updated just now' : `Updated ${min} min ago`;
}

function updateSavedCount() {
  const el = $('#saved-count');
  el.textContent = saved.size ? saved.size : '';
}

function renderStats() {
  const items = state.items;
  const n = arr => arr.length;
  const free = items.filter(i => i.capital === 'free');
  const low = items.filter(i => i.capital === 'low');
  const x = items.filter(i => i.sourceKind === 'x');
  const ng = items.filter(i => i.region === 'nigeria');
  const okSources = state.sourceStatus.filter(s => s.ok).length;
  const totalSources = state.sourceStatus.length;

  $('#stats').innerHTML = `
    <span><b>${n(items)}</b> opportunities</span>
    <span class="dot">•</span><span>⚡ <b>${free.length}</b> free</span>
    <span class="dot">•</span><span>💼 <b>${low.length}</b> low-capital</span>
    <span class="dot">•</span><span>🐦 <b>${x.length}</b> from X</span>
    <span class="dot">•</span><span>🇳🇬 <b>${ng.length}</b> Nigeria</span>`;

  const srcEl = $('.sources');
  if (srcEl) srcEl.remove();
  if (totalSources) {
    const d = document.createElement('details');
    d.className = 'sources';
    d.innerHTML = `<summary>📡 Sources: ${okSources}/${totalSources} online — ${renderTook()}</summary>
      <ul>${state.sourceStatus.map(s => `
        <li><span class="${s.ok ? 'ok' : 'bad'}">${s.ok ? '●' : '○'}</span>
        ${esc(s.name)} <span class="muted">(${s.count}${s.rescued ? ' · carried over' : ''}${s.error ? ' — ' + esc(s.error) : ''})</span></li>`).join('')}
      </ul>`;
    $('#stats').after(d);
  }
}

function renderTook() {
  return state.mode === 'search' ? 'custom search results' : 'full scan';
}

function matchesTab(item) {
  switch (state.tab) {
    case 'free': return item.capital === 'free';
    case 'low': return item.capital === 'low';
    case 'x': return item.sourceKind === 'x';
    case 'nigeria': return item.region === 'nigeria';
    default: return true;
  }
}

function currentList() {
  let list = state.tab === 'saved'
    ? [...saved.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    : state.items.filter(matchesTab);
  if (state.tab !== 'saved' && state.topics.size) {
    list = list.filter(i => [...state.topics].every(t => (i.topics || []).includes(t)));
  } else if (state.topics.size) {
    list = list.filter(i => [...state.topics].every(t => (i.topics || []).includes(t)));
  }
  return list;
}

const SRC_BADGE = { reddit: 'src-reddit', web: 'src-web', x: 'src-x', jobs: 'src-jobs' };

function cardHtml(item) {
  const chips = [];
  chips.push(`<span class="chip ${SRC_BADGE[item.sourceKind] || 'src-web'}">${esc(item.source)}</span>`);
  if (item.capital === 'free') chips.push(`<span class="chip capital-free">⚡ FREE</span>`);
  else if (item.capital === 'low') chips.push(`<span class="chip capital-low">💼 LOW-CAPITAL</span>`);
  if (item.region === 'nigeria') chips.push(`<span class="chip region">🇳🇬 NIGERIA</span>`);
  for (const t of item.topics || []) {
    const meta = TOPIC_META[t];
    if (meta) chips.push(`<span class="chip topic">${meta[0]} ${esc(meta[1])}</span>`);
  }
  if (item.risk && item.risk.length) {
    chips.push(`<span class="chip risk" title="Possible red flags:\n${esc(item.risk.join('\n'))}">⚠ ${item.risk.length} red flag${item.risk.length > 1 ? 's' : ''}</span>`);
  }
  const ago = timeAgo(item.date);
  const isSaved = saved.has(item.url);
  return `
  <article class="card">
    <div class="chips">${chips.join('')}</div>
    <h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
    ${item.snippet ? `<p class="snippet">${esc(item.snippet)}</p>` : '<p class="snippet"></p>'}
    <div class="meta">
      <span>${ago ? `<span class="ago">${ago}</span>` : esc(hostLabel(item.url))}</span>
      <span class="actions">
        <a class="icon-btn" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" title="Open link">↗</a>
        <button class="icon-btn ${isSaved ? 'saved' : ''}" data-save="${esc(item.url)}" title="${isSaved ? 'Remove from saved' : 'Save for later'}">${isSaved ? '🔖' : '🏷️'}</button>
      </span>
    </div>
  </article>`;
}

function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'link'; }
}

function render() {
  const list = currentList();
  const cards = $('#cards');
  cards.innerHTML = list.map(cardHtml).join('');
  $('#loading-note')?.classList.add('hidden');
  $('#empty').classList.toggle('hidden', list.length > 0);

  $$('#cards [data-save]').forEach(btn => {
    btn.addEventListener('click', () => toggleSave(btn.dataset.save));
  });
}

function toggleSave(url) {
  if (saved.has(url)) {
    saved.delete(url);
    toast('Removed from saved');
  } else {
    const item = state.items.find(i => i.url === url) ||
      (state.tab === 'saved' ? saved.get(url) : null);
    if (!item) return;
    saved.set(url, { ...item, savedAt: Date.now() });
    toast('🔖 Saved — find it in the Saved tab');
  }
  persistSaved();
  render();
}

/* ------------------------------ events ------------------------------ */
$('#tabs').addEventListener('click', e => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  state.tab = btn.dataset.tab;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b === btn));
  render();
});

$('#topic-chips').addEventListener('click', e => {
  const btn = e.target.closest('button[data-topic]');
  if (!btn) return;
  const t = btn.dataset.topic;
  if (state.topics.has(t)) state.topics.delete(t); else state.topics.add(t);
  btn.classList.toggle('active', state.topics.has(t));
  render();
});

$('#search-form').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (q) runSearch(q);
});

$('#clear-search').addEventListener('click', () => {
  $('#search-input').value = '';
  state.query = '';
  loadFeed();
});

$('#refresh-btn').addEventListener('click', () => loadFeed(true));

$('#settings-btn').addEventListener('click', () => {
  $('#x-token-input').value = localStorage.getItem(TOKEN_KEY) || '';
  $('#settings-modal').classList.remove('hidden');
});
$('#close-settings').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
$('#settings-modal').addEventListener('click', e => {
  if (e.target.id === 'settings-modal') $('#settings-modal').classList.add('hidden');
});
$('#save-settings').addEventListener('click', () => {
  const v = $('#x-token-input').value.trim();
  if (v) { localStorage.setItem(TOKEN_KEY, v); toast('Token saved — direct X search enabled'); }
  else { localStorage.removeItem(TOKEN_KEY); toast('Token removed'); }
  $('#settings-modal').classList.add('hidden');
});
$('#clear-token').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  $('#x-token-input').value = '';
  toast('Token removed');
});

$('#help-btn').addEventListener('click', () => $('#help-modal').classList.remove('hidden'));
$('#close-help').addEventListener('click', () => $('#help-modal').classList.add('hidden'));
$('#help-modal').addEventListener('click', e => {
  if (e.target.id === 'help-modal') $('#help-modal').classList.add('hidden');
});

/* ------------------------------ boot ------------------------------ */
updateSavedCount();
loadFeed();
setInterval(updateUpdatedLabel, 30000);
setInterval(() => { if (state.mode === 'feed' && !state.loading) loadFeed(); }, 10 * 60 * 1000);
