// Three local demo sites so the scanner and console work with nothing to set up:
// a hardened HTTPS site, a half-configured HTTPS shop and a leaky legacy HTTP site.
import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
import { randomBytes, webcrypto } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

x509.cryptoProvider.set(webcrypto);

const page = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`;

const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
const serial = () => '01' + randomBytes(8).toString('hex');
const days = (n) => new Date(Date.now() + n * 86_400_000);
const newKeys = () => webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify']);

async function keyToPem(key) {
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', key)).toString('base64');
  return `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
}

/**
 * Creates an in-memory certificate authority and a leaf certificate for
 * localhost and 127.0.0.1 signed by it.
 */
export async function createDemoPKI() {
  const caKeys = await newKeys();
  const ca = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serial(),
    name: 'CN=vantage demo CA, O=vantage',
    notBefore: days(-1),
    notAfter: days(3650),
    signingAlgorithm: ALG,
    keys: caKeys,
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(caKeys.publicKey),
    ],
  });

  const leafKeys = await newKeys();
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: serial(),
    subject: 'CN=localhost',
    issuer: ca.subject,
    notBefore: days(-1),
    notAfter: days(200),
    signingAlgorithm: ALG,
    publicKey: leafKeys.publicKey,
    signingKey: caKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([
        { type: 'dns', value: 'localhost' },
        { type: 'ip', value: '127.0.0.1' },
      ]),
      await x509.AuthorityKeyIdentifierExtension.create(ca),
    ],
  });

  return { caPem: ca.toString('pem'), certPem: leaf.toString('pem'), keyPem: await keyToPem(leafKeys.privateKey) };
}

const HARDENED_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
  server: 'nginx',
};

function hardened(req, res) {
  if (req.url === '/.well-known/security.txt') {
    res.writeHead(200, { 'content-type': 'text/plain', ...HARDENED_HEADERS });
    return res.end('Contact: mailto:security@hardened.example\nExpires: 2027-12-31T23:59:59Z\n');
  }
  if (req.url !== '/') {
    res.writeHead(404, { 'content-type': 'text/html', ...HARDENED_HEADERS });
    return res.end(page('Not found', 'Nothing here.'));
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'set-cookie': '__Host-session=' + randomBytes(16).toString('hex') + '; Path=/; Secure; HttpOnly; SameSite=Lax',
    ...HARDENED_HEADERS,
  });
  res.end(page('Hardened', 'Every header, a strict CSP and safe cookies.'));
}

function shop(req, res) {
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'strict-transport-security': 'max-age=86400',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.example.com; frame-ancestors 'self'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer-when-downgrade',
    'x-powered-by': 'Express',
    server: 'nginx/1.18.0',
  };
  if (req.url !== '/') {
    // A soft 404: the shop returns its home page for every path.
    res.writeHead(200, headers);
    return res.end(page('Shop', 'Welcome to the shop.'));
  }
  res.writeHead(200, {
    ...headers,
    'set-cookie': ['cart=' + randomBytes(6).toString('hex') + '; Path=/; Secure', 'sessionid=' + randomBytes(12).toString('hex') + '; Path=/; Secure; HttpOnly'],
  });
  res.end(page('Shop', 'Welcome to the shop.'));
}

function legacy(req, res) {
  const origin = req.headers.origin;
  const headers = {
    server: 'Apache/2.4.29 (Ubuntu)',
    'x-powered-by': 'PHP/7.2.24',
    ...(origin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } : {}),
  };
  switch (req.url) {
    case '/.git/HEAD':
      res.writeHead(200, { ...headers, 'content-type': 'text/plain' });
      return res.end('ref: refs/heads/master\n');
    case '/.env':
      res.writeHead(200, { ...headers, 'content-type': 'text/plain' });
      return res.end('APP_ENV=production\nDB_PASSWORD=hunter2\nSTRIPE_KEY=sk_live_redacted\n');
    case '/phpinfo.php':
      res.writeHead(200, { ...headers, 'content-type': 'text/html' });
      return res.end('<html><head><title>phpinfo()</title></head><body>PHP Version 7.2.24</body></html>');
    case '/':
      res.writeHead(200, {
        ...headers,
        'content-type': 'text/html',
        'set-cookie': 'PHPSESSID=' + randomBytes(12).toString('hex') + '; path=/',
      });
      return res.end(page('Legacy', 'An old PHP site that nobody has touched in years.'));
    default:
      res.writeHead(404, { ...headers, 'content-type': 'text/html' });
      return res.end(page('404', 'Not found'));
  }
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address().port));
  });
}

/**
 * Starts the three demo sites. Pass port 0 to let the OS pick free ports.
 * @returns {Promise<{sites: {name: string, url: string, expect: string}[], ca: string, close: () => Promise<void>}>}
 */
export async function startDemo({ host = '127.0.0.1', ports = [18443, 18444, 18080] } = {}) {
  const pki = await createDemoPKI();
  const tlsOpts = { key: pki.keyPem, cert: pki.certPem, minVersion: 'TLSv1.2' };
  const servers = [https.createServer(tlsOpts, hardened), https.createServer(tlsOpts, shop), http.createServer(legacy)];
  const bound = [];
  for (const [i, s] of servers.entries()) bound.push(await listen(s, ports[i], host));

  const name = host === '127.0.0.1' ? 'localhost' : host;
  return {
    ca: pki.caPem,
    sites: [
      { name: 'hardened', url: `https://${name}:${bound[0]}/`, expect: 'A+' },
      { name: 'shop', url: `https://${name}:${bound[1]}/`, expect: 'D' },
      { name: 'legacy', url: `http://${name}:${bound[2]}/`, expect: 'F' },
    ],
    close: () => Promise.all(servers.map((s) => new Promise((r) => s.close(() => r())))).then(() => {}),
  };
}
