// Data sources:
//   • DuckDuckGo search via the r.jina.ai reader proxy (keyless web search,
//     incl. site:x.com queries for X posts) — max ~20 req/min, so requests
//     run on a single polite lane.
//   • Reddit Atom feeds (r/beermoney, r/WorkOnline, …) — own slow lane.
//   • RemoteOK jobs API.
//   • Optional direct X API search when the user supplies a bearer token.
// (Flat file structure so non-technical users can upload everything to GitHub
//  without dealing with folders.)
import { XMLParser } from 'fast-xml-parser';
import { classify } from './classify.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchText(url, { timeout = 12000, headers = {}, retries = 1, retryDelay = 2500, defaultUa = true } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(retryDelay * attempt);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const base = defaultUa ? { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } : {};
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { ...base, ...headers } });
      if (res.status === 403 || res.status === 429) throw new Error(`HTTP ${res.status} (rate limited)`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

function decodeEntities(str = '') {
  return String(str)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;|&rsquo;|&#x27;/g, "'").replace(/&nbsp;/g, ' ');
}

function stripHtml(html = '') {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function hostOf(url = '') {
  try { return new URL(url).hostname.replace(/^(www|m|mobile)\./, ''); } catch { return ''; }
}

function agoToDate(n, unit) {
  const ms = { minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6 }[unit];
  return ms ? new Date(Date.now() - n * ms).toISOString() : null;
}

// Simple concurrency pool with a polite delay between task starts.
async function pool(tasks, concurrency = 2, delay = 1000) {
  const out = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      if (idx > 0) await sleep(delay * (0.7 + Math.random() * 0.6));
      out[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return out;
}

/* --------------- DuckDuckGo search via r.jina.ai reader ------------------ */

function parseDdgMarkdown(md) {
  const items = [];
  // DDG result titles render as markdown headings: "## [Title](ddg redirect)".
  const re = /^#{1,3}\s*\[([^\]\n]{4,}?)\]\((https?:\/\/(?:html\.)?duckduckgo\.com\/l\/\?uddg=[^)\s]+)\)/gm;
  const matches = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    matches.push({ title: m[1], raw: m[2], idx: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    let url = matches[i].raw;
    try { url = new URL(matches[i].raw).searchParams.get('uddg') || matches[i].raw; } catch { /* keep raw */ }
    if (!url.startsWith('http') || hostOf(url) === 'duckduckgo.com') continue;

    // Snippet: description renders as a link / plain lines after the title.
    const tail = md.slice(matches[i].end, matches[i + 1] ? matches[i + 1].idx : matches[i].end + 700);
    const cleanLines = tail.split('\n')
      .map(l => l.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '') // drop favicon image links
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')                    // keep link text, drop url
        .replace(/[#*>]/g, '').replace(/\*\*/g, '').trim())
      .filter(l => l.length > 30 && l.includes(' ') && !l.includes('duckduckgo.com')
        && !/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(l));               // drop bare-domain echo lines
    const snippet = cleanLines.join(' ').slice(0, 260);

    let date = null;
    const iso = tail.match(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/);
    const ago = tail.match(/(\d+)\s+(minutes?|hours?|days?|weeks?|months?)\s+ago/i);
    if (iso) date = new Date(iso[1]).toISOString();
    else if (ago) date = agoToDate(parseInt(ago[1], 10), ago[2].toLowerCase().replace(/s$/, ''));

    const title = matches[i].title.replace(/\*\*/g, '').trim();
    if (title.includes(' ') && !/^[\w.-]+\.[a-z]{2,}\//i.test(title)) {
      items.push({ title, url, snippet, date });
    }
  }
  return items;
}

export async function ddgSearch(q, count = 8, { fresh = false } = {}) {
  let target = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
  if (fresh) target += '&df=w'; // past week — keeps things feeling like "updates"
  // NOTE: default (neutral) UA and no extra headers — jina.ai 403s browser
  // impersonation UAs and returns junk for its custom response headers.
  const md = await fetchText('https://r.jina.ai/' + target, {
    defaultUa: false,
    timeout: 25000,
    retries: 2,
    retryDelay: 4500
  });
  return parseDdgMarkdown(md).slice(0, count);
}

/* --------------------------- Reddit (Atom RSS) --------------------------- */

const atomParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false
});

function parseAtomEntries(xml) {
  const feed = atomParser.parse(xml)?.feed;
  let entries = feed?.entry ?? [];
  if (!Array.isArray(entries)) entries = [entries];
  return entries;
}

function mapRedditEntry(e) {
  const links = Array.isArray(e.link) ? e.link : [e.link];
  const href = decodeEntities(links.find(l => l?.['@_href'])?.['@_href'] || e.id || '');
  const content = e.content?.['#text'] ?? e.content ?? '';
  return {
    title: decodeEntities(String(e.title || '')).trim(),
    url: href,
    snippet: stripHtml(content).slice(0, 280) || null,
    date: e.updated || null
  };
}

async function redditFeed(sub) {
  const xml = await fetchText(`https://www.reddit.com/r/${sub}/new/.rss`, {
    headers: { 'User-Agent': UA, Accept: 'application/atom+xml, application/rss+xml, text/xml' },
    retries: 1,
    retryDelay: 4000
  });
  return parseAtomEntries(xml).slice(0, 8).map(mapRedditEntry).filter(i => i.title && i.url);
}

async function redditSearch(q) {
  const xml = await fetchText(`https://www.reddit.com/search.rss?q=${encodeURIComponent(q)}&sort=new`, {
    headers: { 'User-Agent': UA, Accept: 'application/atom+xml, application/rss+xml, text/xml' },
    retries: 1,
    retryDelay: 4000
  });
  return parseAtomEntries(xml).slice(0, 10).map(mapRedditEntry).filter(i => i.title && i.url);
}

/* ------------------------------- RemoteOK -------------------------------- */

async function remoteOK() {
  const text = await fetchText('https://remoteok.com/api');
  const arr = JSON.parse(text);
  return arr
    .filter(x => x && x.position && x.url)
    .slice(0, 12)
    .map(x => ({
      title: `${x.position}${x.company ? ' — ' + x.company : ''}`.trim(),
      url: x.url.startsWith('http') ? x.url : `https://remoteok.com${x.url}`,
      snippet: (x.tags || []).slice(0, 6).join(' · ') || stripHtml(x.description || '').slice(0, 240),
      date: x.date || null,
      presetTopics: ['jobs'],
      presetCapital: 'free'
    }));
}

/* ------------------------- Curated scanning queries ----------------------- */

const REDDIT_SUBS = [
  { sub: 'beermoney', topics: ['microtasks'], capital: 'free' },
  { sub: 'WorkOnline', topics: ['jobs'], capital: 'free' },
  { sub: 'slavelabour', topics: ['jobs'], capital: 'free' },
  { sub: 'forhire', topics: ['jobs'], capital: 'free' },
  { sub: 'sidehustle', topics: ['business'], capital: 'low' },
  { sub: 'airdrops', topics: ['crypto'], capital: 'free' }
];

const WEB_QUERIES = [
  { q: 'free crypto airdrop claim now legit 2026', capital: 'free', topics: ['crypto'], fresh: true },
  { q: 'bug bounty usdc reward program open', capital: 'free', topics: ['crypto'] },
  { q: 'legit apps that pay real money sign up bonus no investment', capital: 'free', topics: ['microtasks'] },
  { q: 'work from home jobs hiring immediately no experience', capital: 'free', topics: ['jobs'], fresh: true },
  { q: 'small business grants applications open now', capital: 'free', topics: ['grants'], fresh: true },
  { q: 'businesses you can start with $100 profitable', capital: 'low', topics: ['business'] },
  { q: 'side hustles with low startup cost that actually work', capital: 'low', topics: ['business'] },
  { q: 'profitable business to start in nigeria with 100k naira', capital: 'low', topics: ['business'], region: 'nigeria' },
  { q: 'nigeria SME grant empowerment program application', capital: 'free', topics: ['grants'], region: 'nigeria', fresh: true },
  { q: 'legit online jobs in nigeria that pay daily', capital: 'free', topics: ['jobs'], region: 'nigeria' }
];

const X_QUERIES = [
  'site:x.com airdrop claim free',
  'site:x.com hiring remote apply',
  'site:x.com earn money online'
];

const X_HOST_RE = /(^|\.)(x\.com|twitter\.com)$/;

const JUNK_HOSTS = new Set([
  'merriam-webster.com', 'dictionary.com', 'thesaurus.com', 'en.wikipedia.org',
  'britannica.com', 'vocabulary.com', 'collinsdictionary.com', 'dictionary.cambridge.org',
  'cambridge.org', 'oxfordlearnersdictionaries.com', 'duckduckgo.com'
]);

const RELEVANT_RE = /(earn|money|income|profit|\bpaid\b|\bpay\b|payments?|cash\b|cashback|job|jobs|hiring|hire|gig|freelanc|grant|funding|airdrop|bounty|bonus|business|hustle|startup|start a|remote|salary|naira|₦|\$\d|usd\b|ngn|invest|opportunit|scholarship|loan|work from home|sign ?up)/i;

/* ------------------------------ Aggregation ------------------------------ */

function finalizeItems(rawItems) {
  const seen = new Set();
  const out = [];
  let id = 1;
  for (const it of rawItems) {
    if (!it.title || !it.url) continue;
    const host = hostOf(it.url);
    if (JUNK_HOSTS.has(host)) continue;
    if ((it.sourceKind === 'web' || it.sourceKind === 'x') &&
        !RELEVANT_RE.test(`${it.title} ${it.snippet || ''}`)) continue;
    const key = `${host}|${it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = classify(it);
    out.push({
      id: id++,
      title: it.title,
      url: it.url,
      snippet: it.snippet || '',
      date: it.date || null,
      source: it.source,
      sourceKind: it.sourceKind,
      ...c
    });
  }
  out.sort((a, b) => (Date.parse(b.date || 0) || 0) - (Date.parse(a.date || 0) || 0));
  return out.slice(0, 180);
}

function collapseStatus(list) {
  const map = new Map();
  for (const s of list) {
    const prev = map.get(s.name);
    if (!prev) map.set(s.name, { ...s });
    else map.set(s.name, {
      ...prev,
      ok: prev.ok || s.ok,
      count: prev.count + s.count,
      error: prev.ok && s.ok ? undefined : (prev.error || s.error)
    });
  }
  return [...map.values()];
}

export async function gatherAll() {
  const started = Date.now();
  const sourceStatus = [];
  const push = (name, ok, count, err) =>
    sourceStatus.push({ name, ok, count: count ?? 0, error: ok ? undefined : String(err).slice(0, 160) });

  const wrap = (name, fn) => async () => {
    try {
      const items = await fn();
      push(name, true, items.length);
      return items;
    } catch (e) {
      push(name, false, 0, e.message);
      return [];
    }
  };

  // Reddit lane: sequential + slow (Reddit rate-limits aggressively).
  const redditTasks = REDDIT_SUBS.map(({ sub, topics, capital }) =>
    wrap(`Reddit r/${sub}`, async () => (await redditFeed(sub)).map(x => ({
      ...x, source: `r/${sub}`, sourceKind: 'reddit', presetTopics: topics, presetCapital: capital
    }))));

  // Jina/DDG lane: single worker (20 req/min shared limit, ~3s per request).
  const ddgTasks = [
    ...WEB_QUERIES.map(wq => wrap('Web scan', async () =>
      (await ddgSearch(wq.q, 8, { fresh: !!wq.fresh })).map(x => ({
        ...x, source: 'Web', sourceKind: 'web',
        presetCapital: wq.capital, presetTopics: wq.topics, presetRegion: wq.region
      })))),
    ...X_QUERIES.map(q => wrap('X posts (via web)', async () =>
      (await ddgSearch(q, 10, { fresh: true }))
        .filter(x => X_HOST_RE.test(hostOf(x.url)))
        .map(x => ({ ...x, source: 'X (via web)', sourceKind: 'x' }))))
  ];

  const remoteTask = wrap('RemoteOK', async () =>
    (await remoteOK()).map(x => ({ ...x, source: 'RemoteOK', sourceKind: 'jobs' })));

  const [redditResults, ddgResults, remoteResults] = await Promise.all([
    pool(redditTasks, 1, 1700),
    pool(ddgTasks, 1, 1200),
    pool([remoteTask], 1, 0)
  ]);

  return {
    updatedAt: new Date().toISOString(),
    tookMs: Date.now() - started,
    items: finalizeItems([...redditResults.flat(), ...ddgResults.flat(), ...remoteResults.flat()]),
    sourceStatus: collapseStatus(sourceStatus)
  };
}

export async function customSearch(q) {
  const started = Date.now();
  const sourceStatus = [];
  const runs = [
    {
      name: 'Web search',
      run: async () => (await ddgSearch(`${q} earn opportunity`, 10))
        .map(x => ({ ...x, source: 'Web', sourceKind: 'web' }))
    },
    {
      name: 'Reddit search',
      run: async () => (await redditSearch(q))
        .map(x => ({ ...x, source: 'r/search', sourceKind: 'reddit' }))
    },
    {
      name: 'X search (via web)',
      run: async () => (await ddgSearch(`site:x.com ${q}`, 10))
        .filter(x => X_HOST_RE.test(hostOf(x.url)))
        .map(x => ({ ...x, source: 'X (via web)', sourceKind: 'x' }))
    }
  ];
  const settled = await Promise.allSettled(runs.map(r => r.run()));
  const rows = [];
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      sourceStatus.push({ name: runs[i].name, ok: true, count: res.value.length });
      rows.push(...res.value);
    } else {
      sourceStatus.push({ name: runs[i].name, ok: false, count: 0, error: String(res.reason).slice(0, 160) });
    }
  });
  return {
    updatedAt: new Date().toISOString(),
    tookMs: Date.now() - started,
    items: finalizeItems(rows),
    sourceStatus
  };
}

/* ------------------- Optional direct X API (user token) ------------------- */

export async function xDirectSearch(q, bearerToken) {
  const params = new URLSearchParams({
    query: q || '(airdrop OR "earn money online" OR "hiring remote" OR "side hustle") -is:retweet lang:en',
    max_results: '10',
    'tweet.fields': 'created_at,author_id',
    expansions: 'author_id',
    'user.fields': 'username'
  });
  const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${bearerToken}`, 'User-Agent': UA }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X API ${res.status}: ${JSON.stringify(json).slice(0, 220)}`);
  const users = Object.fromEntries((json.includes?.users || []).map(u => [u.id, u.username]));
  const items = (json.data || []).map(t => ({
    title: t.text.slice(0, 140),
    url: `https://x.com/${users[t.author_id] || 'i'}/status/${t.id}`,
    snippet: t.text.slice(0, 260),
    date: t.created_at || null,
    source: 'X API',
    sourceKind: 'x'
  }));
  return {
    updatedAt: new Date().toISOString(),
    items: finalizeItems(items),
    sourceStatus: [{ name: 'X API', ok: true, count: items.length }]
  };
}
