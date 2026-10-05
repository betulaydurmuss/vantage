import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

export const USER_AGENT = 'vantage/1 (+https://github.com/betulaydurmuss/vantage)';
const MAX_BODY = 1 << 20;

/**
 * Normalizes user input into an absolute http(s) URL.
 * @param {string} raw
 * @returns {URL}
 */
export function normalize(raw) {
  let s = String(raw ?? '').trim();
  if (!s) throw new Error('empty target');
  if (!s.includes('://')) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`invalid target: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`unsupported scheme ${u.protocol.replace(':', '')}`);
  }
  if (!u.hostname) throw new Error('target has no host');
  u.hash = '';
  return u;
}

/** Trust store: the bundled roots plus any extra CA certificates. */
export function trustStore(extraCA = []) {
  return extraCA.length ? [...tls.rootCertificates, ...extraCA] : undefined;
}

/**
 * Performs one request without following redirects. Certificates are not
 * enforced so broken sites can still be scanned; the trust verdict is reported
 * in `tls.authorized` and `tls.authorizationError` instead.
 *
 * @param {URL|string} url
 * @param {{method?: string, headers?: Record<string,string>, timeout?: number, ca?: string[], readBody?: boolean}} [opts]
 */
export function request(url, opts = {}) {
  const u = typeof url === 'string' ? new URL(url) : url;
  const mod = u.protocol === 'https:' ? https : http;
  const timeout = opts.timeout ?? 10_000;

  return new Promise((resolve, reject) => {
    const req = mod.request(
      u,
      {
        method: opts.method ?? 'GET',
        headers: { 'user-agent': USER_AGENT, accept: '*/*', ...opts.headers },
        rejectUnauthorized: false,
        ca: opts.ca,
        agent: false,
        timeout,
      },
      (res) => {
        const socket = res.socket;
        let tlsInfo = null;
        if (socket instanceof tls.TLSSocket) {
          tlsInfo = {
            protocol: socket.getProtocol(),
            cipher: socket.getCipher()?.name ?? '',
            authorized: socket.authorized,
            authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
            cert: socket.getPeerCertificate(true),
          };
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          if (opts.readBody === false || size >= MAX_BODY) return;
          size += c.length;
          chunks.push(c);
        });
        res.on('end', () =>
          resolve({
            url: u,
            status: res.statusCode ?? 0,
            headers: res.headers,
            rawHeaders: res.rawHeaders,
            body: Buffer.concat(chunks).subarray(0, MAX_BODY),
            tls: tlsInfo,
            remoteAddress: socket.remoteAddress ?? '',
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timed out after ${timeout}ms`)));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Requests a URL and follows up to five redirects. Returns the final response
 * and the chain of hops that led to it.
 */
export async function fetchFollow(url, opts = {}) {
  let current = typeof url === 'string' ? new URL(url) : url;
  const chain = [];
  for (let hop = 0; hop <= 5; hop++) {
    const res = await request(current, opts);
    const loc = res.headers.location;
    if (res.status >= 300 && res.status < 400 && loc) {
      chain.push({ url: current.href, status: res.status });
      current = new URL(loc, current);
      continue;
    }
    return { ...res, chain };
  }
  throw new Error('stopped after 5 redirects');
}

/** Returns every value of a response header as an array. */
export function headerValues(res, name) {
  const v = res.headers[name.toLowerCase()];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
