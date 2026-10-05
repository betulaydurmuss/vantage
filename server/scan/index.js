import { randomUUID } from 'node:crypto';
import { checkCookies, checkCORS } from './cookies.js';
import { checkDNS } from './dns.js';
import { checkExposure } from './exposure.js';
import { fetchFollow, normalize, trustStore } from './fetch.js';
import { grade, sortFindings } from './findings.js';
import { checkCSP, checkHeaders } from './headers.js';
import { checkTLS, checkTransport } from './tls.js';

export { normalize } from './fetch.js';
export { CATEGORIES, GRADES, gradeRank } from './findings.js';

const CHECKS = [checkTransport, checkTLS, checkHeaders, checkCSP, checkCookies, checkCORS, checkExposure, checkDNS];

/**
 * Scans one URL and returns a graded report.
 *
 * @param {string} raw target URL or bare host name
 * @param {{timeout?: number, ca?: string[], skipDNS?: boolean}} [opts]
 */
export async function scan(raw, opts = {}) {
  const started = Date.now();
  const input = normalize(raw);
  const timeout = opts.timeout ?? 10_000;
  const ca = trustStore(opts.ca);

  let res;
  try {
    res = await fetchFollow(input, { timeout, ca });
  } catch (err) {
    throw new Error(`could not reach ${input.href}: ${err.message}`, { cause: err });
  }

  const t = { input, final: res.url, res, timeout, ca, skipDNS: !!opts.skipDNS };
  const results = await Promise.all(CHECKS.map((check) => check(t)));
  const findings = sortFindings(results.flat());
  const { score, grade: letter, counts } = grade(findings);

  return {
    id: randomUUID(),
    target: input.href,
    finalUrl: res.url.href,
    redirects: res.chain,
    statusCode: res.status,
    ip: res.remoteAddress,
    tls: res.tls
      ? {
          protocol: res.tls.protocol,
          cipher: res.tls.cipher,
          issuer: res.tls.cert?.issuer?.CN ?? res.tls.cert?.issuer?.O ?? '',
          subject: res.tls.cert?.subject?.CN ?? '',
          validTo: res.tls.cert?.valid_to ? new Date(res.tls.cert.valid_to).toISOString() : null,
        }
      : null,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    score,
    grade: letter,
    counts,
    findings,
  };
}
