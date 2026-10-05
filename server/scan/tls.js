import net from 'node:net';
import tls from 'node:tls';
import { request } from './fetch.js';
import { Category, Severity, fail, pass, skip } from './findings.js';

const T = Category.transport;
const C = Category.tls;

/** The page is served over HTTPS, and plain HTTP redirects to it. */
export async function checkTransport(t) {
  const out = [];
  const https = t.final.protocol === 'https:';

  out.push(
    https
      ? pass('transport.https', T, 'Served over HTTPS', `final URL ${t.final.href}`)
      : fail(
          'transport.https',
          T,
          Severity.high,
          'Served over HTTPS',
          'the page is delivered over plain HTTP, so traffic can be read and modified in transit',
          'Serve the site over HTTPS and redirect every HTTP request to it.',
        ),
  );

  const title = 'HTTP redirects to HTTPS';
  if (t.input.protocol === 'http:' && https) {
    out.push(pass('transport.redirect', T, title, `the HTTP URL redirected to ${t.final.href}`));
    return out;
  }
  if (!https) {
    out.push(skip('transport.redirect', T, title, 'site is not served over HTTPS'));
    return out;
  }
  if (t.final.port && t.final.port !== '443') {
    out.push(skip('transport.redirect', T, title, `non-standard port ${t.final.port}; no matching HTTP port to probe`));
    return out;
  }

  const plain = new URL(t.final.href);
  plain.protocol = 'http:';
  plain.port = '';
  try {
    const res = await request(plain, { timeout: t.timeout, readBody: false });
    const loc = res.headers.location ?? '';
    if (res.status >= 300 && res.status < 400 && /^https:\/\//i.test(loc)) {
      out.push(pass('transport.redirect', T, title, `${res.status} → ${loc}`));
    } else {
      out.push(
        fail(
          'transport.redirect',
          T,
          Severity.medium,
          title,
          `http://${plain.host} answered ${res.status} without redirecting to HTTPS`,
          'Answer every plain HTTP request with a 301 redirect to the HTTPS URL.',
        ),
      );
    }
  } catch {
    out.push(pass('transport.redirect', T, title, 'port 80 does not serve plain HTTP'));
  }
  return out;
}

const TITLES = {
  'tls.version': 'Modern TLS version',
  'tls.legacy': 'Legacy TLS 1.0/1.1 refused',
  'tls.trust': 'Certificate is trusted',
  'tls.hostname': 'Certificate matches host',
  'tls.expiry': 'Certificate is not expiring',
};

/** Negotiated protocol, legacy protocol support and the certificate chain. */
export async function checkTLS(t) {
  const info = t.res.tls;
  if (!info) {
    return Object.entries(TITLES).map(([id, title]) => skip(id, C, title, 'site is not served over HTTPS'));
  }
  const out = [];

  if (info.protocol === 'TLSv1.3') {
    out.push(pass('tls.version', C, TITLES['tls.version'], `negotiated TLS 1.3 with ${info.cipher}`));
  } else if (info.protocol === 'TLSv1.2') {
    out.push(
      fail(
        'tls.version',
        C,
        Severity.info,
        TITLES['tls.version'],
        `negotiated TLS 1.2 with ${info.cipher}; TLS 1.3 is not offered`,
        'Enable TLS 1.3 on the server.',
      ),
    );
  } else {
    out.push(
      fail(
        'tls.version',
        C,
        Severity.high,
        TITLES['tls.version'],
        `negotiated ${info.protocol}`,
        'Disable TLS 1.0 and 1.1; serve TLS 1.2 and 1.3 only.',
      ),
    );
  }

  out.push(await checkLegacy(t));

  const cert = info.cert;
  if (!cert || !cert.raw) {
    out.push(
      fail('tls.trust', C, Severity.critical, TITLES['tls.trust'], 'the server presented no certificate', 'Install a certificate.'),
    );
    return out;
  }

  if (info.authorized) {
    out.push(pass('tls.trust', C, TITLES['tls.trust'], `chain verifies to a trusted root; issued by ${cert.issuer?.CN ?? cert.issuer?.O ?? 'unknown'}`));
  } else {
    const err = info.authorizationError ?? 'certificate could not be verified';
    const detail = /SELF_SIGNED/.test(err) ? `the certificate is self-signed (${err})` : err;
    out.push(
      fail(
        'tls.trust',
        C,
        Severity.high,
        TITLES['tls.trust'],
        detail,
        "Use a certificate issued by a publicly trusted CA, such as Let's Encrypt, and serve the full chain.",
      ),
    );
  }

  const host = t.final.hostname.replace(/^\[|\]$/g, '');
  const mismatch = tls.checkServerIdentity(host, cert);
  out.push(
    mismatch
      ? fail(
          'tls.hostname',
          C,
          Severity.high,
          TITLES['tls.hostname'],
          mismatch.message,
          `Issue a certificate whose subject alternative names include ${host}.`,
        )
      : pass('tls.hostname', C, TITLES['tls.hostname'], `certificate covers ${host}`),
  );

  const notAfter = new Date(cert.valid_to);
  const days = Math.floor((notAfter.getTime() - Date.now()) / 86_400_000);
  const exp = notAfter.toISOString().slice(0, 10);
  const renew = 'Renew the certificate and automate renewal.';
  if (days < 0) {
    out.push(fail('tls.expiry', C, Severity.critical, TITLES['tls.expiry'], `certificate expired on ${exp}`, renew));
  } else if (days < 7) {
    out.push(fail('tls.expiry', C, Severity.high, TITLES['tls.expiry'], `certificate expires in ${days} days (${exp})`, renew));
  } else if (days < 21) {
    out.push(fail('tls.expiry', C, Severity.medium, TITLES['tls.expiry'], `certificate expires in ${days} days (${exp})`, renew));
  } else {
    out.push(pass('tls.expiry', C, TITLES['tls.expiry'], `valid for ${days} more days (until ${exp})`));
  }
  return out;
}

/** Opens a second connection that offers only TLS 1.0 and 1.1. */
function checkLegacy(t) {
  const host = t.final.hostname.replace(/^\[|\]$/g, '');
  const port = Number(t.final.port || 443);
  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port,
      servername: net.isIP(host) ? undefined : host,
      minVersion: 'TLSv1',
      maxVersion: 'TLSv1.1',
      ciphers: 'DEFAULT@SECLEVEL=0',
      rejectUnauthorized: false,
      timeout: t.timeout,
    });
    const done = (finding) => {
      socket.destroy();
      resolve(finding);
    };
    socket.once('secureConnect', () =>
      done(
        fail(
          'tls.legacy',
          C,
          Severity.medium,
          TITLES['tls.legacy'],
          `the server accepted a ${socket.getProtocol()} handshake`,
          'Set the minimum protocol version to TLS 1.2.',
        ),
      ),
    );
    const refused = () => done(pass('tls.legacy', C, TITLES['tls.legacy'], 'the server rejected a TLS 1.0/1.1-only handshake'));
    socket.once('error', refused);
    socket.once('timeout', refused);
  });
}
