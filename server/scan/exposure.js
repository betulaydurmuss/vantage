import { request } from './fetch.js';
import { Category, Severity, fail, pass } from './findings.js';

const E = Category.exposure;

/**
 * Files that should never be public. Each probe validates the body, so a site
 * that answers 200 with its normal page for every path is not reported.
 */
export const PROBES = [
  {
    id: 'exposure.git',
    path: '/.git/HEAD',
    title: 'Git repository is not exposed',
    severity: Severity.critical,
    match: (b) => /^ref: refs\//.test(b.toString('utf8')),
    detail: 'the .git directory is served; the full source and history can be downloaded',
    fix: 'Block every path under /.git at the web server and keep the repository outside the web root.',
  },
  {
    id: 'exposure.env',
    path: '/.env',
    title: '.env file is not exposed',
    severity: Severity.critical,
    match: (b, ct) => !/html/i.test(ct) && /^[A-Z][A-Z0-9_]*=.*/m.test(b.toString('utf8')),
    detail: 'the .env file is served and typically holds database passwords and API keys',
    fix: 'Remove .env from the web root, block dotfiles and rotate every secret it contained.',
  },
  {
    id: 'exposure.dsstore',
    path: '/.DS_Store',
    title: '.DS_Store is not exposed',
    severity: Severity.low,
    match: (b) => b.length >= 8 && b.subarray(4, 8).toString('latin1') === 'Bud1',
    detail: 'a macOS .DS_Store file is served and lists the directory contents',
    fix: 'Delete .DS_Store files from the deployment and block dotfiles.',
  },
  {
    id: 'exposure.status',
    path: '/server-status',
    title: 'Server status page is private',
    severity: Severity.medium,
    match: (b) => /Apache Server Status|Server uptime/i.test(b.toString('utf8')),
    detail: 'the server-status page is public and shows live requests and client IPs',
    fix: 'Restrict /server-status to localhost or remove mod_status.',
  },
  {
    id: 'exposure.phpinfo',
    path: '/phpinfo.php',
    title: 'phpinfo() is not exposed',
    severity: Severity.medium,
    match: (b) => /<title>phpinfo\(\)<\/title>|PHP Version \d/i.test(b.toString('utf8')),
    detail: 'phpinfo() output is public and reveals configuration, paths and environment variables',
    fix: 'Delete phpinfo.php from the server.',
  },
  {
    id: 'exposure.backup',
    path: '/backup.zip',
    title: 'No public backup archive',
    severity: Severity.high,
    match: (b) => b.length >= 4 && b.subarray(0, 4).toString('latin1') === 'PK\u0003\u0004',
    detail: 'a backup archive is downloadable from the web root',
    fix: 'Move backups off the web server.',
  },
];

/** Probes well-known sensitive paths and looks for security.txt. */
export async function checkExposure(t) {
  const origin = t.final.origin;
  const results = await Promise.all(
    PROBES.map(async (p) => {
      try {
        const res = await request(new URL(p.path, origin), { timeout: t.timeout, ca: t.ca });
        if (res.status === 200 && p.match(res.body, res.headers['content-type'] ?? '')) {
          return fail(p.id, E, p.severity, p.title, `${p.path}: ${p.detail}`, p.fix);
        }
        return pass(p.id, E, p.title, `${p.path} → ${res.status}`);
      } catch {
        return pass(p.id, E, p.title, `${p.path} is unreachable`);
      }
    }),
  );

  const title = 'security.txt is published';
  let sec;
  try {
    const res = await request(new URL('/.well-known/security.txt', origin), { timeout: t.timeout, ca: t.ca });
    const text = res.body.toString('utf8');
    sec =
      res.status === 200 && /^Contact:/im.test(text)
        ? pass('exposure.securitytxt', E, title, `Contact: ${/^Contact:\s*(.+)$/im.exec(text)[1].trim()}`)
        : null;
  } catch {
    sec = null;
  }
  results.push(
    sec ??
      fail(
        'exposure.securitytxt',
        E,
        Severity.info,
        title,
        'no /.well-known/security.txt with a Contact field; researchers have no way to report a vulnerability',
        'Publish /.well-known/security.txt (RFC 9116) with Contact and Expires fields.',
      ),
  );
  return results;
}
