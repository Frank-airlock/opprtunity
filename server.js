import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatherAll, customSearch, xDirectSearch } from './sources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Flat structure: serve only the three frontend files.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
for (const f of ['style.css', 'app.js']) {
  app.get('/' + f, (req, res) => res.sendFile(path.join(__dirname, f)));
}
app.use(express.json());

let feedCache = { at: 0, data: null };
const FEED_TTL = 10 * 60 * 1000; // 10 minutes

// Last-good item memory per source so a rate-limited source (e.g. a Reddit
// sub returning 429) doesn't make its opportunities vanish from the feed.
const lastGood = new Map(); // item.source -> items[]

function rememberItems(items) {
  const bySrc = new Map();
  for (const it of items) {
    if (!it.date) continue;
    if (!bySrc.has(it.source)) bySrc.set(it.source, []);
    bySrc.get(it.source).push(it);
  }
  for (const [src, list] of bySrc) lastGood.set(src, list);
}

const STATUS_TO_SOURCE = { RemoteOK: 'RemoteOK', 'Web scan': 'Web', 'X posts (via web)': 'X (via web)' };

function rescueFailedSources(data) {
  const present = new Set(data.items.map(i => i.url));
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const s of data.sourceStatus) {
    if (s.ok) continue;
    const src = s.name.startsWith('Reddit ') ? s.name.slice(7) : STATUS_TO_SOURCE[s.name];
    const good = lastGood.get(src) || [];
    const add = good.filter(i => !present.has(i.url) && Date.parse(i.date || 0) > cutoff);
    if (add.length) {
      data.items.push(...add);
      s.ok = true;
      s.rescued = true;
      s.count = add.length;
      s.error = undefined;
    }
  }
  data.items.sort((a, b) => (Date.parse(b.date || 0) || 0) - (Date.parse(a.date || 0) || 0));
  data.items = data.items.slice(0, 200);
  data.items.forEach((it, idx) => { it.id = idx + 1; });
  return data;
}

app.get('/api/opportunities', async (req, res) => {
  try {
    if (feedCache.data && Date.now() - feedCache.at < FEED_TTL) {
      return res.json({ ...feedCache.data, cached: true, cacheAgeMs: Date.now() - feedCache.at });
    }
    const data = rescueFailedSources(await gatherAll());
    rememberItems(data.items);
    feedCache = { at: Date.now(), data };
    res.json({ ...data, cached: false });
  } catch (e) {
    if (feedCache.data) return res.json({ ...feedCache.data, cached: true, stale: true });
    res.status(502).json({ error: String(e?.message || e) });
  }
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });
  try {
    res.json(await customSearch(q));
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

app.get('/api/x-direct', async (req, res) => {
  const token = String(req.header('x-x-bearer') || '').trim();
  if (!token) return res.status(400).json({ error: 'No X bearer token provided. Add one in Settings.' });
  try {
    res.json(await xDirectSearch(req.query.q, token));
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Opportunity Scout listening on http://0.0.0.0:${PORT}`);
});
