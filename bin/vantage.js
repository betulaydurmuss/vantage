#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createApp, rescanWatchlist } from '../server/app.js';
import { startDemo } from '../server/demo.js';
import { CATEGORIES, gradeRank, scan } from '../server/scan/index.js';
import { Store } from '../server/store.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const USAGE = `vantage ${pkg.version} — website security posture scanner

Usage:
  vantage scan <url>... [--json] [--fail-under <grade>] [--no-dns] [--timeout <ms>] [--ca <file>]
  vantage serve [--listen <host:port>] [--data <file>] [--no-demo] [--watch-every <minutes>] [--dev]
  vantage demo                start the demo sites and scan each one
  vantage version

Examples:
  vantage scan example.com
  vantage scan https://example.com --fail-under B     exit 1 if the grade is below B
  vantage serve                                       console on http://127.0.0.1:7070
`;

const tty = (process.stdout.isTTY || !!process.env.FORCE_COLOR) && !process.env.NO_COLOR;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: paint('1'),
  dim: paint('2'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  magenta: paint('35'),
  cyan: paint('36'),
};
const SEV = { critical: c.magenta, high: c.red, medium: c.yellow, low: c.blue, info: c.dim };
const gradeColor = (g) => (g.startsWith('A') ? c.green : g === 'B' || g === 'C' ? c.yellow : c.red);

function printReport(r) {
  const out = [];
  out.push('');
  out.push(`  ${c.bold(r.finalUrl)}  ${c.dim(`${r.statusCode} · ${r.ip || '-'} · ${r.durationMs}ms`)}`);
  out.push(`  grade ${c.bold(gradeColor(r.grade)(r.grade.padEnd(2)))}  score ${c.bold(r.score)}/100  ` +
    c.dim(`${r.counts.pass} passed · ${r.counts.fail} failed · ${r.counts.skip} skipped`));
  for (const cat of CATEGORIES) {
    const fs = r.findings.filter((f) => f.category === cat);
    if (!fs.length) continue;
    out.push('');
    out.push(`  ${c.bold(cat)}`);
    for (const f of fs) {
      if (f.status === 'pass') out.push(`    ${c.green('✓')} ${f.title}  ${c.dim(f.detail)}`);
      else if (f.status === 'skip') out.push(`    ${c.dim('–')} ${c.dim(f.title)}  ${c.dim(f.detail)}`);
      else {
        out.push(`    ${c.red('✗')} ${f.title}  ${SEV[f.severity](f.severity.toUpperCase())}`);
        out.push(`        ${f.detail}`);
        out.push(`        ${c.cyan('fix:')} ${f.fix}`);
      }
    }
  }
  out.push('');
  console.log(out.join('\n'));
}

async function cmdScan(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      'fail-under': { type: 'string' },
      'no-dns': { type: 'boolean' },
      timeout: { type: 'string', default: '10000' },
      ca: { type: 'string', multiple: true },
    },
  });
  if (!positionals.length) throw new Error('scan needs at least one URL');
  const threshold = values['fail-under'];
  if (threshold && gradeRank(threshold) < 0) throw new Error(`unknown grade ${threshold}; use A+, A, B, C, D or F`);

  const opts = {
    timeout: Number(values.timeout),
    skipDNS: values['no-dns'],
    ca: (values.ca ?? []).map((f) => readFileSync(f, 'utf8')),
  };
  const reports = [];
  let failed = false;
  for (const url of positionals) {
    try {
      const r = await scan(url, opts);
      reports.push(r);
      if (!values.json) printReport(r);
      if (threshold && gradeRank(r.grade) < gradeRank(threshold)) failed = true;
    } catch (err) {
      failed = true;
      console.error(`${c.red('error')} ${err.message}`);
    }
  }
  if (values.json) console.log(JSON.stringify(positionals.length === 1 ? reports[0] ?? null : reports, null, 2));
  if (threshold && failed && !values.json) console.error(c.red(`grade below ${threshold}`));
  return failed ? 1 : 0;
}

async function cmdServe(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      listen: { type: 'string', default: process.env.VANTAGE_LISTEN ?? '127.0.0.1:7070' },
      data: { type: 'string', default: process.env.VANTAGE_DATA ?? path.join(os.homedir(), '.vantage', 'data.json') },
      'no-demo': { type: 'boolean' },
      'watch-every': { type: 'string', default: '30' },
      dev: { type: 'boolean' },
    },
  });
  const idx = values.listen.lastIndexOf(':');
  const host = values.listen.slice(0, idx) || '127.0.0.1';
  const port = Number(values.listen.slice(idx + 1));
  if (!Number.isInteger(port)) throw new Error(`invalid --listen ${values.listen}`);

  const store = await new Store(values.data).load();
  const demo = values['no-demo'] ? null : await startDemo();
  const app = await createApp({ store, demo, dev: values.dev });

  // Seed an empty install with the demo sites so the console has data to show.
  if (demo && store.reports.length === 0) {
    for (const s of demo.sites) {
      store.addWatch(s.url);
      await app.locals.runScan(s.url).catch(() => {});
    }
  }

  const minutes = Number(values['watch-every']);
  if (minutes > 0) {
    setInterval(() => rescanWatchlist(store, app.locals.runScan), minutes * 60_000).unref();
  }

  await new Promise((resolve, reject) => {
    const server = app.listen(port, host, resolve);
    server.once('error', reject);
  });
  console.log(`${c.bold('vantage')} console  ${c.cyan(`http://${host.includes(':') ? `[${host}]` : host}:${port}`)}`);
  console.log(c.dim(`  data      ${values.data}`));
  if (minutes > 0) console.log(c.dim(`  watchlist rescanned every ${minutes} min`));
  if (demo) for (const s of demo.sites) console.log(c.dim(`  demo      ${s.name.padEnd(9)} ${s.url}`));
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    console.log(c.yellow('  warning: the console can make requests to any URL; keep it off untrusted networks'));
  }
}

async function cmdDemo() {
  const demo = await startDemo({ ports: [0, 0, 0] });
  let ok = true;
  console.log('');
  for (const s of demo.sites) {
    const r = await scan(s.url, { ca: [demo.ca] });
    const match = r.grade === s.expect;
    ok &&= match;
    const worst = r.findings.filter((f) => f.status === 'fail' && ['critical', 'high'].includes(f.severity));
    console.log(
      `  ${gradeColor(r.grade)(c.bold(r.grade.padEnd(2)))}  ${s.name.padEnd(9)} ${c.dim(s.url.padEnd(26))} ` +
        `score ${String(r.score).padStart(3)}  ${r.counts.fail} failed` +
        (worst.length ? c.dim(`  (${worst.map((f) => f.id).join(', ')})`) : ''),
    );
  }
  console.log('');
  console.log(ok ? `  ${c.green('every demo site graded as expected')}` : `  ${c.red('a demo site graded unexpectedly')}`);
  console.log('');
  await demo.close();
  return ok ? 0 : 1;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'scan':
      return cmdScan(rest);
    case 'serve':
      await cmdServe(rest);
      return null;
    case 'demo':
      return cmdDemo();
    case 'version':
    case '--version':
    case '-v':
      console.log(`vantage ${pkg.version} (node ${process.version})`);
      return 0;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE);
      return 0;
    default:
      console.error(`unknown command "${cmd}"\n\n${USAGE}`);
      return 2;
  }
}

main().then(
  (code) => {
    if (code !== null) process.exitCode = code;
  },
  (err) => {
    console.error(`${c.red('error')} ${err.message}`);
    process.exitCode = 1;
  },
);
