import { headerValues, request } from './fetch.js';
import { Category, Severity, fail, pass, skip } from './findings.js';

const K = Category.cookies;
const X = Category.cors;
const SESSION = /sess|auth|token|sid|jwt|login|remember/i;

/** Parses one Set-Cookie header into its name and lower-cased attributes. */
export function parseCookie(header) {
  const [pair, ...attrs] = header.split(';');
  const name = pair.split('=')[0].trim();
  const flags = {};
  for (const a of attrs) {
    const [k, ...v] = a.trim().split('=');
    if (k) flags[k.toLowerCase()] = v.join('=').trim();
  }
  return { name, flags };
}

/** Secure, HttpOnly and SameSite on every cookie the page sets. */
export function checkCookies(t) {
  const cookies = headerValues(t.res, 'set-cookie').map(parseCookie);
  const titles = {
    'cookies.secure': 'Cookies are Secure',
    'cookies.httponly': 'Session cookies are HttpOnly',
    'cookies.samesite': 'Cookies set SameSite',
  };
  if (!cookies.length) {
    return Object.entries(titles).map(([id, title]) => skip(id, K, title, 'the page sets no cookies'));
  }
  const https = t.final.protocol === 'https:';
  const out = [];

  const insecure = cookies.filter((c) => !('secure' in c.flags)).map((c) => c.name);
  if (!https) {
    out.push(skip('cookies.secure', K, titles['cookies.secure'], 'Secure cookies require HTTPS'));
  } else {
    out.push(
      insecure.length
        ? fail(
            'cookies.secure',
            K,
            Severity.medium,
            titles['cookies.secure'],
            `missing Secure: ${insecure.join(', ')}`,
            'Add the Secure attribute so cookies are never sent over plain HTTP.',
          )
        : pass('cookies.secure', K, titles['cookies.secure'], `${cookies.length} cookie(s), all Secure`),
    );
  }

  const exposed = cookies.filter((c) => SESSION.test(c.name) && !('httponly' in c.flags)).map((c) => c.name);
  const anyExposed = cookies.filter((c) => !('httponly' in c.flags)).map((c) => c.name);
  if (exposed.length) {
    out.push(
      fail(
        'cookies.httponly',
        K,
        Severity.medium,
        titles['cookies.httponly'],
        `session-like cookies readable from JavaScript: ${exposed.join(', ')}`,
        'Add HttpOnly so a script injected through XSS cannot steal the session.',
      ),
    );
  } else if (anyExposed.length) {
    out.push(
      fail(
        'cookies.httponly',
        K,
        Severity.low,
        titles['cookies.httponly'],
        `readable from JavaScript: ${anyExposed.join(', ')}`,
        'Add HttpOnly to every cookie that scripts do not need to read.',
      ),
    );
  } else {
    out.push(pass('cookies.httponly', K, titles['cookies.httponly'], 'all cookies are HttpOnly'));
  }

  const noSameSite = cookies.filter((c) => !c.flags.samesite).map((c) => c.name);
  const noneInsecure = cookies.filter((c) => /^none$/i.test(c.flags.samesite ?? '') && !('secure' in c.flags)).map((c) => c.name);
  if (noneInsecure.length) {
    out.push(
      fail(
        'cookies.samesite',
        K,
        Severity.medium,
        titles['cookies.samesite'],
        `SameSite=None without Secure: ${noneInsecure.join(', ')}`,
        'SameSite=None requires Secure; prefer SameSite=Lax.',
      ),
    );
  } else if (noSameSite.length) {
    out.push(
      fail(
        'cookies.samesite',
        K,
        Severity.low,
        titles['cookies.samesite'],
        `no SameSite attribute: ${noSameSite.join(', ')}`,
        'Set SameSite=Lax (or Strict) explicitly to limit cross-site request forgery.',
      ),
    );
  } else {
    out.push(pass('cookies.samesite', K, titles['cookies.samesite'], 'every cookie sets SameSite'));
  }
  return out;
}

const EVIL = 'https://evil.vantage-probe.example';

/** Sends a foreign Origin and checks whether the response trusts it. */
export async function checkCORS(t) {
  const title = 'Foreign origins are not trusted';
  let res;
  try {
    res = await request(t.final, { timeout: t.timeout, headers: { origin: EVIL }, readBody: false, ca: t.ca });
  } catch (err) {
    return [skip('cors.origin', X, title, `probe failed: ${err.message}`)];
  }
  const acao = res.headers['access-control-allow-origin'] ?? '';
  const creds = /^true$/i.test(res.headers['access-control-allow-credentials'] ?? '');

  if (acao === EVIL || acao === 'null') {
    return [
      fail(
        'cors.origin',
        X,
        creds ? Severity.critical : Severity.high,
        title,
        `Access-Control-Allow-Origin reflects ${acao}${creds ? ' with credentials allowed: any site can read authenticated responses' : ''}`,
        'Allow only an explicit list of trusted origins; never echo the request Origin.',
      ),
    ];
  }
  if (acao === '*' && creds) {
    return [
      fail(
        'cors.origin',
        X,
        Severity.medium,
        title,
        'Access-Control-Allow-Origin "*" combined with Allow-Credentials true',
        'Drop Allow-Credentials or replace "*" with explicit origins.',
      ),
    ];
  }
  return [pass('cors.origin', X, title, acao ? `Access-Control-Allow-Origin: ${acao}` : 'no CORS headers for a foreign origin')];
}
