import { Category as C } from './findings.js';
import { PROBES } from './exposure.js';

/**
 * Every check vantage runs, with the worst severity it can report and why it
 * matters. The console renders this as the check reference.
 */
export const CATALOG = [
  { id: 'transport.https', category: C.transport, title: 'Served over HTTPS', max: 'high', why: 'Plain HTTP can be read and rewritten by anyone on the network path.' },
  { id: 'transport.redirect', category: C.transport, title: 'HTTP redirects to HTTPS', max: 'medium', why: 'Visitors who type the bare domain land on HTTP first; it must forward them to HTTPS.' },
  { id: 'tls.version', category: C.tls, title: 'Modern TLS version', max: 'high', why: 'TLS 1.3 removes legacy ciphers and saves a round trip.' },
  { id: 'tls.legacy', category: C.tls, title: 'Legacy TLS 1.0/1.1 refused', max: 'medium', why: 'TLS 1.0 and 1.1 are deprecated (RFC 8996) and enable downgrade attacks.' },
  { id: 'tls.trust', category: C.tls, title: 'Certificate is trusted', max: 'critical', why: 'Browsers show a full-page warning for untrusted or self-signed certificates.' },
  { id: 'tls.hostname', category: C.tls, title: 'Certificate matches host', max: 'high', why: 'A certificate for another name is indistinguishable from an interception attempt.' },
  { id: 'tls.expiry', category: C.tls, title: 'Certificate is not expiring', max: 'critical', why: 'An expired certificate takes the site offline for every visitor.' },
  { id: 'headers.hsts', category: C.headers, title: 'Strict-Transport-Security', max: 'high', why: 'HSTS makes the browser refuse plain HTTP, closing the SSL-stripping window.' },
  { id: 'headers.framing', category: C.headers, title: 'Framing is restricted', max: 'medium', why: 'A page that can be framed can be overlaid for clickjacking.' },
  { id: 'headers.nosniff', category: C.headers, title: 'X-Content-Type-Options', max: 'low', why: 'Stops browsers from reinterpreting uploads as scripts or styles.' },
  { id: 'headers.referrer', category: C.headers, title: 'Referrer-Policy', max: 'medium', why: 'URLs often carry tokens and IDs that should not reach third parties.' },
  { id: 'headers.permissions', category: C.headers, title: 'Permissions-Policy', max: 'low', why: 'Denies powerful browser features to the page and anything it embeds.' },
  { id: 'headers.coop', category: C.headers, title: 'Cross-Origin-Opener-Policy', max: 'info', why: 'Isolates the browsing context from cross-origin popups and openers.' },
  { id: 'headers.leak', category: C.headers, title: 'No version disclosure', max: 'low', why: 'Version banners let attackers match the server to known CVEs instantly.' },
  { id: 'csp.present', category: C.csp, title: 'Policy is enforced', max: 'medium', why: 'A Content Security Policy is the strongest browser-side defence against XSS.' },
  { id: 'csp.script', category: C.csp, title: "No 'unsafe-inline' scripts", max: 'medium', why: "'unsafe-inline' lets injected inline scripts run, which defeats the policy." },
  { id: 'csp.eval', category: C.csp, title: "No 'unsafe-eval'", max: 'low', why: 'eval() turns string injection into code execution.' },
  { id: 'csp.wildcard', category: C.csp, title: 'No wildcard script sources', max: 'medium', why: 'Wildcards let any host, including attacker-controlled ones, serve scripts.' },
  { id: 'csp.object', category: C.csp, title: 'Plugins are blocked', max: 'low', why: "Plugin content bypasses most of the policy; object-src 'none' removes it." },
  { id: 'csp.base', category: C.csp, title: '<base> is restricted', max: 'low', why: 'An injected <base> tag can repoint every relative script URL.' },
  { id: 'cookies.secure', category: C.cookies, title: 'Cookies are Secure', max: 'medium', why: 'Without Secure a cookie is sent over any plain HTTP request to the host.' },
  { id: 'cookies.httponly', category: C.cookies, title: 'Session cookies are HttpOnly', max: 'medium', why: 'HttpOnly keeps session cookies out of reach of injected scripts.' },
  { id: 'cookies.samesite', category: C.cookies, title: 'Cookies set SameSite', max: 'medium', why: 'SameSite limits when cookies ride along on cross-site requests (CSRF).' },
  { id: 'cors.origin', category: C.cors, title: 'Foreign origins are not trusted', max: 'critical', why: 'Reflecting any Origin with credentials lets every site read logged-in responses.' },
  ...PROBES.map((p) => ({ id: p.id, category: C.exposure, title: p.title, max: p.severity, why: `${p.path}: ${p.detail}.` })),
  { id: 'exposure.securitytxt', category: C.exposure, title: 'security.txt is published', max: 'info', why: 'RFC 9116 gives researchers a known place to report vulnerabilities.' },
  { id: 'dns.spf', category: C.dns, title: 'SPF record', max: 'medium', why: 'SPF lists who may send mail for the domain, the first line against spoofing.' },
  { id: 'dns.dmarc', category: C.dns, title: 'DMARC policy', max: 'low', why: 'DMARC tells receivers to reject mail that fails SPF and DKIM.' },
  { id: 'dns.caa', category: C.dns, title: 'CAA record', max: 'info', why: 'CAA restricts which certificate authorities may issue for the domain.' },
];
