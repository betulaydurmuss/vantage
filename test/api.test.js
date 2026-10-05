import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { serve } from './helpers.js';

describe('API', () => {
  let server, base, site, dir, store;

  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'vantage-'));
    store = await new Store(path.join(dir, 'data.json')).load();
    site = await serve((req, res) => res.end('ok'));
    const app = await createApp({ store, scanOptions: { skipDNS: true, timeout: 3000 } });
    server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(async () => {
    await new Promise((r) => server.close(r));
    await site.close();
    await rm(dir, { recursive: true, force: true });
  });

  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  test('meta lists the checks', async () => {
    const meta = await (await fetch(`${base}/meta`)).json();
    assert.equal(meta.categories.length, 8);
    assert.ok(meta.catalog.length >= 30);
    assert.equal(new Set(meta.catalog.map((c) => c.id)).size, meta.catalog.length);
  });

  test('scan validates input', async () => {
    const res = await post('/scan', { url: 'ftp://nope' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /unsupported scheme/);
  });

  test('unreachable targets return 502', async () => {
    const res = await post('/scan', { url: 'http://127.0.0.1:1/' });
    assert.equal(res.status, 502);
  });

  test('a scan is stored, listed, fetched, persisted and deleted', async () => {
    const report = await (await post('/scan', { url: site.url })).json();
    assert.equal(report.target, site.url);
    assert.ok(report.grade);

    const list = await (await fetch(`${base}/reports`)).json();
    assert.equal(list[0].id, report.id);
    assert.equal(list[0].findings, undefined, 'summaries omit findings');

    const full = await (await fetch(`${base}/reports/${report.id}`)).json();
    assert.equal(full.findings.length, report.findings.length);
    assert.equal(full.trend.length, 1);

    await store.saving;
    const disk = JSON.parse(await readFile(store.file, 'utf8'));
    assert.equal(disk.reports[0].id, report.id);

    assert.equal((await fetch(`${base}/reports/${report.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(`${base}/reports/${report.id}`)).status, 404);
  });

  test('the watchlist adds, rescans, deduplicates and removes', async () => {
    const entry = await (await post('/watch', { url: site.url })).json();
    const again = await (await post('/watch', { url: site.url })).json();
    assert.equal(again.id, entry.id);

    const status = await (await post('/watch/run', {})).json();
    assert.equal(status.length, 1);
    assert.ok(status[0].latest);
    assert.equal(status[0].lastError, null);

    const stats = await (await fetch(`${base}/stats`)).json();
    assert.equal(stats.watched, 1);
    assert.equal(stats.sites, 1);

    assert.equal((await fetch(`${base}/watch/${entry.id}`, { method: 'DELETE' })).status, 204);
    assert.deepEqual(await (await fetch(`${base}/watch`)).json(), []);
  });

  test('unknown API routes are JSON 404s', async () => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'not found');
  });
});
