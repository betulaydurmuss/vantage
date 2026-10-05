import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startDemo } from '../server/demo.js';
import { scan } from '../server/scan/index.js';
import { byId } from './helpers.js';

let demo;
before(async () => {
  demo = await startDemo({ ports: [0, 0, 0] });
});
after(() => demo.close());

test('every demo site gets its expected grade', async () => {
  for (const site of demo.sites) {
    const r = await scan(site.url, { ca: [demo.ca] });
    assert.equal(r.grade, site.expect, `${site.name}: got ${r.grade} (${r.score})`);
  }
});

test('the hardened site passes every TLS check against the demo CA', async () => {
  const r = await scan(demo.sites[0].url, { ca: [demo.ca] });
  for (const id of ['tls.version', 'tls.legacy', 'tls.trust', 'tls.hostname', 'tls.expiry']) {
    assert.equal(byId(r, id).status, 'pass', id);
  }
  assert.equal(r.tls.protocol, 'TLSv1.3');
});

test('without the demo CA the certificate is reported as untrusted', async () => {
  const r = await scan(demo.sites[0].url);
  const trust = byId(r, 'tls.trust');
  assert.equal(trust.status, 'fail');
  assert.equal(trust.severity, 'high');
});
