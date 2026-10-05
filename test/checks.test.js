import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { parseCookie } from '../server/scan/cookies.js';
import { normalize } from '../server/scan/fetch.js';
import { parseCSP } from '../server/scan/headers.js';
import { scan } from '../server/scan/index.js';
import { byId, serve } from './helpers.js';

describe('normalize', () => {
  test('adds https and a path to bare hosts', () => {
    assert.equal(normalize('example.com').href, 'https://example.com/');
  });
  test('keeps explicit schemes and drops fragments', () => {
    assert.equal(normalize('http://example.com/a#b').href, 'http://example.com/a');
  });
  test('rejects other schemes and empty input', () => {
    assert.throws(() => normalize('ftp://example.com'), /unsupported scheme/);
    assert.throws(() => normalize('  '), /empty target/);
  });
});

describe('parsers', () => {
  test('parseCSP splits directives and keeps the first duplicate', () => {
    const csp = parseCSP("default-src 'self'; script-src 'self' cdn.example; script-src *");
    assert.deepEqual(csp['default-src'], ["'self'"]);
    assert.deepEqual(csp['script-src'], ["'self'", 'cdn.example']);
  });
  test('parseCookie reads the name and flags', () => {
    const c = parseCookie('sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax');
    assert.equal(c.name, 'sid');
    assert.ok('secure' in c.flags && 'httponly' in c.flags);
    assert.equal(c.flags.samesite, 'Lax');
  });
});

describe('header checks', () => {
  let site;
  before(async () => {
    site = await serve((req, res) => {
      res.setHeader('x-powered-by', 'PHP/8.1.2');
      res.setHeader('referrer-policy', 'unsafe-url');
      res.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *");
      res.setHeader('set-cookie', ['session=1; Path=/', 'theme=dark; Path=/; HttpOnly; SameSite=Lax']);
      res.end('<h1>hi</h1>');
    });
  });
  after(() => site.close());

  test('weak headers, CSP and cookies are reported', async () => {
    const r = await scan(site.url, { skipDNS: true });
    assert.equal(byId(r, 'transport.https').severity, 'high');
    assert.equal(byId(r, 'headers.referrer').severity, 'medium');
    assert.match(byId(r, 'headers.leak').detail, /PHP\/8\.1\.2/);
    assert.equal(byId(r, 'headers.framing').status, 'fail');
    assert.equal(byId(r, 'csp.present').status, 'pass');
    assert.equal(byId(r, 'csp.script').status, 'fail');
    assert.equal(byId(r, 'csp.eval').status, 'fail');
    assert.equal(byId(r, 'csp.wildcard').status, 'fail');
    assert.equal(byId(r, 'csp.base').status, 'fail');
    assert.equal(byId(r, 'cookies.httponly').severity, 'medium');
    assert.match(byId(r, 'cookies.httponly').detail, /session/);
    assert.match(byId(r, 'cookies.samesite').detail, /session/);
    assert.equal(byId(r, 'cookies.secure').status, 'skip');
  });

  test('TLS and DNS checks skip on plain HTTP and local hosts', async () => {
    const r = await scan(site.url);
    for (const id of ['tls.trust', 'tls.expiry', 'dns.spf', 'dns.dmarc']) assert.equal(byId(r, id).status, 'skip', id);
  });
});

describe('CSP with nonces', () => {
  let site;
  before(async () => {
    site = await serve((req, res) => {
      res.setHeader('content-security-policy', "script-src 'nonce-abc' 'unsafe-inline' 'strict-dynamic'; object-src 'none'; base-uri 'none'");
      res.end('ok');
    });
  });
  after(() => site.close());

  test("'unsafe-inline' is ignored when a nonce is present", async () => {
    const r = await scan(site.url, { skipDNS: true });
    assert.equal(byId(r, 'csp.script').status, 'pass');
    assert.equal(byId(r, 'csp.object').status, 'pass');
  });
});

describe('exposure probes', () => {
  let soft, leaky;
  before(async () => {
    // Answers 200 with the home page for every path: must not be reported.
    soft = await serve((req, res) => res.end('<!doctype html><title>home</title>'));
    leaky = await serve((req, res) => {
      if (req.url === '/.git/HEAD') return res.end('ref: refs/heads/main\n');
      if (req.url === '/.env') return res.end('DB_PASSWORD=secret\n');
      if (req.url === '/.well-known/security.txt') return res.end('Contact: mailto:sec@example.com\n');
      res.statusCode = 404;
      res.end('not found');
    });
  });
  after(() => Promise.all([soft.close(), leaky.close()]));

  test('soft 404 pages are not false positives', async () => {
    const r = await scan(soft.url, { skipDNS: true });
    for (const id of ['exposure.git', 'exposure.env', 'exposure.backup', 'exposure.dsstore']) assert.equal(byId(r, id).status, 'pass', id);
    assert.equal(byId(r, 'exposure.securitytxt').status, 'fail');
  });

  test('real leaks are critical and security.txt is found', async () => {
    const r = await scan(leaky.url, { skipDNS: true });
    assert.equal(byId(r, 'exposure.git').severity, 'critical');
    assert.equal(byId(r, 'exposure.env').severity, 'critical');
    assert.equal(byId(r, 'exposure.securitytxt').status, 'pass');
    assert.equal(r.grade, 'F');
  });
});

describe('CORS', () => {
  let site;
  before(async () => {
    site = await serve((req, res) => {
      if (req.headers.origin) {
        res.setHeader('access-control-allow-origin', req.headers.origin);
        res.setHeader('access-control-allow-credentials', 'true');
      }
      res.end('ok');
    });
  });
  after(() => site.close());

  test('a reflected origin with credentials is critical', async () => {
    const r = await scan(site.url, { skipDNS: true });
    assert.equal(byId(r, 'cors.origin').severity, 'critical');
  });
});

describe('redirects', () => {
  let target, hop;
  before(async () => {
    target = await serve((req, res) => res.end('final'));
    hop = await serve((req, res) => {
      res.writeHead(301, { location: target.url });
      res.end();
    });
  });
  after(() => Promise.all([target.close(), hop.close()]));

  test('the report follows redirects and records the chain', async () => {
    const r = await scan(hop.url, { skipDNS: true });
    assert.equal(r.finalUrl, target.url);
    assert.equal(r.redirects.length, 1);
    assert.equal(r.redirects[0].status, 301);
  });
});

test('an unreachable target fails with a clear error', async () => {
  await assert.rejects(scan('http://127.0.0.1:1/', { timeout: 2000 }), /could not reach/);
});
