import { Resolver } from 'node:dns/promises';
import net from 'node:net';
import { Category, Severity, fail, pass, skip } from './findings.js';

const D = Category.dns;
const TITLES = {
  'dns.spf': 'SPF record',
  'dns.dmarc': 'DMARC policy',
  'dns.caa': 'CAA record',
};

/** Registrable-ish domain: the last two labels, which is right for most hosts. */
export function baseDomain(host) {
  const labels = host.split('.');
  return labels.slice(-2).join('.');
}

const isLocal = (host) => net.isIP(host) || host === 'localhost' || host.endsWith('.localhost') || !host.includes('.');

/** Mail-spoofing and certificate-issuance policy published in DNS. */
export async function checkDNS(t) {
  const host = t.final.hostname.replace(/^\[|\]$/g, '');
  if (t.skipDNS || isLocal(host)) {
    const why = t.skipDNS ? 'DNS checks disabled' : `${host} is not a public domain`;
    return Object.entries(TITLES).map(([id, title]) => skip(id, D, title, why));
  }
  const resolver = new Resolver({ timeout: t.timeout, tries: 2 });
  const domain = baseDomain(host);
  const txt = async (name) => {
    try {
      return (await resolver.resolveTxt(name)).map((r) => r.join(''));
    } catch {
      return [];
    }
  };

  const out = [];
  const spf = (await txt(domain)).find((r) => /^v=spf1\b/i.test(r));
  if (!spf) {
    out.push(
      fail(
        'dns.spf',
        D,
        Severity.low,
        TITLES['dns.spf'],
        `${domain} publishes no SPF record; anyone can send mail as @${domain}`,
        'Publish a TXT record such as "v=spf1 include:<your mail provider> -all".',
      ),
    );
  } else if (/[+?]all\b/i.test(spf) || !/all\b/i.test(spf)) {
    out.push(
      fail('dns.spf', D, Severity.medium, TITLES['dns.spf'], `"${spf}" does not reject unlisted senders`, 'End the record with "-all" or "~all".'),
    );
  } else {
    out.push(pass('dns.spf', D, TITLES['dns.spf'], spf));
  }

  const dmarc = (await txt(`_dmarc.${domain}`)).find((r) => /^v=DMARC1\b/i.test(r));
  const policy = /\bp=(\w+)/i.exec(dmarc ?? '')?.[1]?.toLowerCase();
  if (!dmarc) {
    out.push(
      fail(
        'dns.dmarc',
        D,
        Severity.low,
        TITLES['dns.dmarc'],
        `_dmarc.${domain} has no DMARC record`,
        'Publish "v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain + '" and move to p=reject.',
      ),
    );
  } else if (policy === 'none') {
    out.push(
      fail('dns.dmarc', D, Severity.low, TITLES['dns.dmarc'], `"${dmarc}" monitors but does not block spoofed mail`, 'Move the policy to p=quarantine or p=reject.'),
    );
  } else {
    out.push(pass('dns.dmarc', D, TITLES['dns.dmarc'], dmarc));
  }

  const caa = await resolver.resolveCaa(domain).catch(() => []);
  out.push(
    caa.length
      ? pass('dns.caa', D, TITLES['dns.caa'], caa.map((r) => `${r.issue ? 'issue' : r.issuewild ? 'issuewild' : 'iodef'} ${r.issue ?? r.issuewild ?? r.iodef ?? ''}`).join('; '))
      : fail(
          'dns.caa',
          D,
          Severity.info,
          TITLES['dns.caa'],
          `${domain} has no CAA record; any certificate authority may issue for it`,
          'Publish a CAA record naming the CA you use, e.g. 0 issue "letsencrypt.org".',
        ),
  );
  return out;
}
