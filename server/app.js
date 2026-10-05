// The HTTP API and the console. In development Vite runs as middleware; in
// production the built console is served from dist/.
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG } from './scan/catalog.js';
import { CATEGORIES, GRADES, gradeRank, normalize, scan } from './scan/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_CONCURRENT_SCANS = 4;

/**
 * @param {{store: import("./store.js").Store, demo?: {sites: object[], ca: string} | null,
 *          scanOptions?: object, dev?: boolean}} deps
 */
export async function createApp({ store, demo = null, scanOptions = {}, dev = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.set({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    });
    next();
  });

  const opts = { ...scanOptions, ca: [...(scanOptions.ca ?? []), ...(demo ? [demo.ca] : [])] };
  let running = 0;

  /** Scans one target and stores the report. Throws on unreachable targets. */
  async function runScan(target) {
    const report = await scan(target, opts);
    await store.addReport(report);
    return report;
  }
  app.locals.runScan = runScan;

  const api = express.Router();

  api.get('/health', (req, res) => res.json({ ok: true }));

  api.get('/meta', (req, res) =>
    res.json({ categories: CATEGORIES, grades: GRADES, catalog: CATALOG, demo: demo ? demo.sites : [] }),
  );

  api.post('/scan', async (req, res) => {
    let target;
    try {
      target = normalize(req.body?.url).href;
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (running >= MAX_CONCURRENT_SCANS) {
      return res.status(429).json({ error: 'too many scans in progress; try again in a moment' });
    }
    running++;
    try {
      res.json(await runScan(target));
    } catch (err) {
      res.status(502).json({ error: err.message });
    } finally {
      running--;
    }
  });

  api.get('/reports', (req, res) => res.json(store.summaries(req.query.target)));

  api.get('/reports/:id', (req, res) => {
    const r = store.getReport(req.params.id);
    if (!r) return res.status(404).json({ error: 'report not found' });
    res.json({ ...r, trend: store.trend(r.target) });
  });

  api.delete('/reports/:id', (req, res) =>
    store.deleteReport(req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'report not found' }),
  );

  api.get('/stats', (req, res) => res.json(stats(store)));

  api.get('/watch', (req, res) => res.json(store.watchStatus()));

  api.post('/watch', (req, res) => {
    try {
      res.status(201).json(store.addWatch(normalize(req.body?.url).href));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  api.delete('/watch/:id', (req, res) =>
    store.removeWatch(req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'watch entry not found' }),
  );

  api.post('/watch/run', async (req, res) => {
    await rescanWatchlist(store, runScan);
    res.json(store.watchStatus());
  });

  api.use((req, res) => res.status(404).json({ error: 'not found' }));
  app.use('/api', api);

  if (dev) {
    const { createServer } = await import('vite');
    const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
    app.locals.vite = vite;
  } else {
    const dist = path.join(ROOT, 'dist');
    if (existsSync(dist)) {
      app.use(express.static(dist, { index: false, maxAge: '1h' }));
      app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
    } else {
      app.get('/', (req, res) => res.type('text').send('console not built: run "npm run build" or start with --dev\n'));
    }
  }
  return app;
}

/** Rescans every watched target, recording errors on the entry. */
export async function rescanWatchlist(store, runScan) {
  for (const w of store.watch) {
    try {
      await runScan(w.target);
      w.lastError = null;
    } catch (err) {
      w.lastError = err.message;
    }
    w.lastScan = new Date().toISOString();
  }
  await store.save();
}

/** Dashboard numbers, computed from the latest report of each target. */
export function stats(store) {
  const latest = new Map();
  for (const r of store.reports) if (!latest.has(r.target)) latest.set(r.target, r);
  const sites = [...latest.values()];

  const grades = Object.fromEntries(GRADES.map((g) => [g, 0]));
  const failing = new Map();
  const severity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const r of sites) {
    grades[r.grade]++;
    for (const k of Object.keys(severity)) severity[k] += r.counts[k];
    for (const f of r.findings) {
      if (f.status !== 'fail') continue;
      const e = failing.get(f.id) ?? { id: f.id, title: f.title, category: f.category, severity: f.severity, sites: 0 };
      e.sites++;
      failing.set(f.id, e);
    }
  }

  const regressions = store
    .watchStatus()
    .filter((w) => w.latest && w.previous && gradeRank(w.latest.grade) < gradeRank(w.previous.grade))
    .map((w) => ({ target: w.target, from: w.previous.grade, to: w.latest.grade, at: w.latest.startedAt }));

  return {
    scans: store.reports.length,
    sites: sites.length,
    watched: store.watch.length,
    averageScore: sites.length ? Math.round(sites.reduce((s, r) => s + r.score, 0) / sites.length) : null,
    grades,
    severity,
    topFailing: [...failing.values()].sort((a, b) => b.sites - a.sites).slice(0, 8),
    latest: sites.slice(0, 8).map((r) => ({ id: r.id, target: r.target, grade: r.grade, score: r.score, startedAt: r.startedAt, counts: r.counts })),
    regressions,
  };
}
