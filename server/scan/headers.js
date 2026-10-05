import { Category, Severity, fail, pass, skip } from './findings.js';

const H = Category.headers;
const P = Category.csp;
const SIX_MONTHS = 15_552_000;

const get = (t, name) => {
  const v = t.res.headers[name];
  return Array.isArray(v) ? v.join(', ') : (v ?? '');
};

/** Response headers that harden the browser and those that leak details. */
export function checkHeaders(t) {
  const out = [];
  const https = t.final.protocol === 'https:';

  // Strict-Transport-Security
  const hsts = get(t, 'strict-transport-security');
  const hstsTitle = 'Strict-Transport-Security';
  if (!https) {
    out.push(skip('headers.hsts', H, hstsTitle, 'HSTS only applies to HTTPS responses'));
  } else if (!hsts) {
    out.push(
      fail(
        'headers.hsts',
        H,
        Severity.high,
        hstsTitle,
        'missing; browsers will still try plain HTTP first, which can be intercepted',
        'Send "Strict-Transport-Security: max-age=31536000; includeSubDomains".',
      ),
    );
  } else {
    const age = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
    if (age < SIX_MONTHS) {
      out.push(
        fail(
          'headers.hsts',
          H,
          Severity.low,
          hstsTitle,
          `max-age=${age} is shorter than six months`,
          'Raise max-age to at least 15552000 (six months), ideally 31536000.',
        ),
      );
    } else {
      out.push(pass('headers.hsts', H, hstsTitle, hsts));
    }
  }

  // Clickjacking: X-Frame-Options or CSP frame-ancestors
  const xfo = get(t, 'x-frame-options');
  const fa = parseCSP(get(t, 'content-security-policy'))['frame-ancestors'];
  if (fa) {
    out.push(pass('headers.framing', H, 'Framing is restricted', `CSP frame-ancestors ${fa.join(' ')}`));
  } else if (/^(deny|sameorigin)$/i.test(xfo.trim())) {
    out.push(pass('headers.framing', H, 'Framing is restricted', `X-Frame-Options: ${xfo}`));
  } else {
    out.push(
      fail(
        'headers.framing',
        H,
        Severity.medium,
        'Framing is restricted',
        xfo ? `X-Frame-Options "${xfo}" is not DENY or SAMEORIGIN` : 'neither X-Frame-Options nor CSP frame-ancestors is set; the page can be framed for clickjacking',
        "Send \"Content-Security-Policy: frame-ancestors 'self'\" (or X-Frame-Options: DENY).",
      ),
    );
  }

  // X-Content-Type-Options
  const xcto = get(t, 'x-content-type-options');
  out.push(
    /nosniff/i.test(xcto)
      ? pass('headers.nosniff', H, 'X-Content-Type-Options', 'nosniff')
      : fail(
          'headers.nosniff',
          H,
          Severity.low,
          'X-Content-Type-Options',
          'missing; browsers may MIME-sniff responses into executable types',
          'Send "X-Content-Type-Options: nosniff".',
        ),
  );

  // Referrer-Policy
  const rp = get(t, 'referrer-policy').toLowerCase();
  if (!rp) {
    out.push(
      fail(
        'headers.referrer',
        H,
        Severity.low,
        'Referrer-Policy',
        'missing; full URLs may leak to third parties through the Referer header',
        'Send "Referrer-Policy: strict-origin-when-cross-origin".',
      ),
    );
  } else if (/unsafe-url|no-referrer-when-downgrade/.test(rp)) {
    out.push(
      fail(
        'headers.referrer',
        H,
        Severity.medium,
        'Referrer-Policy',
        `"${rp}" sends the full URL to other origins`,
        'Use "strict-origin-when-cross-origin" or "no-referrer".',
      ),
    );
  } else {
    out.push(pass('headers.referrer', H, 'Referrer-Policy', rp));
  }

  // Permissions-Policy
  const pp = get(t, 'permissions-policy');
  out.push(
    pp
      ? pass('headers.permissions', H, 'Permissions-Policy', pp.length > 80 ? `${pp.slice(0, 80)}…` : pp)
      : fail(
          'headers.permissions',
          H,
          Severity.low,
          'Permissions-Policy',
          'missing; embedded content may request camera, microphone or location',
          'Send "Permissions-Policy: camera=(), microphone=(), geolocation=()" and allow only what you use.',
        ),
  );

  // Cross-Origin-Opener-Policy
  const coop = get(t, 'cross-origin-opener-policy');
  out.push(
    coop
      ? pass('headers.coop', H, 'Cross-Origin-Opener-Policy', coop)
      : fail(
          'headers.coop',
          H,
          Severity.info,
          'Cross-Origin-Opener-Policy',
          'missing; cross-origin windows keep a handle to this page',
          'Send "Cross-Origin-Opener-Policy: same-origin".',
        ),
  );

  // Information leakage
  const leaks = [];
  const server = get(t, 'server');
  if (/\d/.test(server)) leaks.push(`Server: ${server}`);
  for (const h of ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator']) {
    const v = get(t, h);
    if (v) leaks.push(`${h}: ${v}`);
  }
  out.push(
    leaks.length
      ? fail(
          'headers.leak',
          H,
          Severity.low,
          'No version disclosure',
          leaks.join('; '),
          'Remove X-Powered-By and similar headers, and strip version numbers from Server.',
        )
      : pass('headers.leak', H, 'No version disclosure', 'no software versions in response headers'),
  );

  return out;
}

/** Parses a CSP header into a directive → source list map. */
export function parseCSP(header) {
  const out = {};
  for (const part of String(header).split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!(key in out)) out[key] = values;
  }
  return out;
}

/** Content Security Policy presence and the classic weaknesses. */
export function checkCSP(t) {
  const header = get(t, 'content-security-policy');
  const reportOnly = get(t, 'content-security-policy-report-only');
  const ids = ['csp.present', 'csp.script', 'csp.eval', 'csp.wildcard', 'csp.object', 'csp.base'];
  const titles = {
    'csp.present': 'Policy is enforced',
    'csp.script': "No 'unsafe-inline' scripts",
    'csp.eval': "No 'unsafe-eval'",
    'csp.wildcard': 'No wildcard script sources',
    'csp.object': 'Plugins are blocked',
    'csp.base': '<base> is restricted',
  };

  if (!header) {
    const out = [
      fail(
        'csp.present',
        P,
        Severity.medium,
        titles['csp.present'],
        reportOnly ? 'only a report-only policy is sent, which blocks nothing' : 'no Content-Security-Policy header; injected scripts run unrestricted',
        "Start from \"default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'\" and add the sources you need.",
      ),
    ];
    for (const id of ids.slice(1)) out.push(skip(id, P, titles[id], 'no policy to evaluate'));
    return out;
  }

  const csp = parseCSP(header);
  const scripts = csp['script-src'] ?? csp['default-src'];
  const scriptDirective = csp['script-src'] ? 'script-src' : 'default-src';
  const out = [pass('csp.present', P, titles['csp.present'], header.length > 120 ? `${header.slice(0, 120)}…` : header)];

  if (!scripts) {
    out.push(
      fail(
        'csp.script',
        P,
        Severity.medium,
        titles['csp.script'],
        'neither script-src nor default-src is set, so scripts are not restricted',
        "Add \"script-src 'self'\".",
      ),
    );
  } else {
    const hasNonce = scripts.some((s) => /^'(nonce|sha256|sha384|sha512)-/.test(s));
    const strictDynamic = scripts.includes("'strict-dynamic'");
    if (scripts.includes("'unsafe-inline'") && !hasNonce && !strictDynamic) {
      out.push(
        fail(
          'csp.script',
          P,
          Severity.medium,
          titles['csp.script'],
          `${scriptDirective} allows 'unsafe-inline', which defeats XSS protection`,
          "Remove 'unsafe-inline' and use nonces or hashes for the inline scripts you need.",
        ),
      );
    } else {
      out.push(pass('csp.script', P, titles['csp.script'], `${scriptDirective} ${scripts.join(' ')}`));
    }
  }

  out.push(
    scripts?.includes("'unsafe-eval'")
      ? fail(
          'csp.eval',
          P,
          Severity.low,
          titles['csp.eval'],
          `${scriptDirective} allows 'unsafe-eval'`,
          "Remove 'unsafe-eval'; avoid eval(), new Function() and string timers.",
        )
      : pass('csp.eval', P, titles['csp.eval'], 'eval() is blocked'),
  );

  const wild = (scripts ?? []).filter((s) => s === '*' || s === 'http:' || s === 'https:' || s === 'data:');
  out.push(
    wild.length
      ? fail(
          'csp.wildcard',
          P,
          Severity.medium,
          titles['csp.wildcard'],
          `${scriptDirective} allows ${wild.join(', ')}, so scripts load from anywhere`,
          'List the exact origins that serve your scripts.',
        )
      : pass('csp.wildcard', P, titles['csp.wildcard'], 'script sources are explicit'),
  );

  const objects = csp['object-src'] ?? csp['default-src'];
  out.push(
    objects && objects.length === 1 && objects[0] === "'none'"
      ? pass('csp.object', P, titles['csp.object'], "object-src 'none'")
      : fail(
          'csp.object',
          P,
          Severity.low,
          titles['csp.object'],
          objects ? `object-src resolves to ${objects.join(' ')}` : 'object-src is not set',
          "Add \"object-src 'none'\".",
        ),
  );

  out.push(
    csp['base-uri']
      ? pass('csp.base', P, titles['csp.base'], `base-uri ${csp['base-uri'].join(' ')}`)
      : fail(
          'csp.base',
          P,
          Severity.low,
          titles['csp.base'],
          'base-uri is not set; an injected <base> tag can redirect relative script URLs',
          "Add \"base-uri 'self'\" (or 'none').",
        ),
  );

  return out;
}
