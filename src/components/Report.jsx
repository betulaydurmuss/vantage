import { useMemo, useState } from 'react';
import { SEVERITIES, host, stamp } from '../format.js';
import { Card, GradeRing, Severity, Sparkline } from './ui.jsx';

const FILTERS = ['failed', 'all', 'passed'];

function FindingRow({ f }) {
  const [open, setOpen] = useState(f.status === 'fail');
  const icon = f.status === 'pass' ? '✓' : f.status === 'skip' ? '–' : '✗';
  return (
    <li className={`finding st-${f.status}`}>
      <button type="button" className="finding-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="finding-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="finding-title">{f.title}</span>
        {f.status === 'fail' ? <Severity level={f.severity} /> : <span className="finding-status">{f.status}</span>}
      </button>
      {open && (
        <div className="finding-body">
          {f.detail && <p className="finding-detail">{f.detail}</p>}
          {f.fix && (
            <p className="finding-fix">
              <span>Fix</span> {f.fix}
            </p>
          )}
          <code className="finding-id">{f.id}</code>
        </div>
      )}
    </li>
  );
}

/** Per-category pass rate bars. */
function CategoryBars({ report, categories }) {
  return (
    <ul className="cat-bars">
      {categories.map((cat) => {
        const fs = report.findings.filter((f) => f.category === cat && f.status !== 'skip');
        if (!fs.length) return null;
        const passed = fs.filter((f) => f.status === 'pass').length;
        const pct = Math.round((passed / fs.length) * 100);
        const tone = pct === 100 ? 'good' : pct >= 60 ? 'warn' : 'bad';
        return (
          <li key={cat}>
            <span className="cat-name">{cat}</span>
            <span className="cat-track">
              <span className={`cat-fill fill-${tone}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="cat-num">
              {passed}/{fs.length}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function Report({ report, categories, trend }) {
  const [filter, setFilter] = useState(report.counts.fail ? 'failed' : 'all');
  const shown = useMemo(
    () =>
      report.findings.filter((f) =>
        filter === 'all' ? true : filter === 'failed' ? f.status === 'fail' : f.status === 'pass',
      ),
    [report, filter],
  );

  return (
    <div className="report">
      <Card className="report-hero">
        <GradeRing grade={report.grade} score={report.score} />
        <div className="report-summary">
          <h2 className="report-host">{host(report.finalUrl)}</h2>
          <p className="muted mono">
            {report.statusCode} · {report.ip || 'unknown IP'} · {report.durationMs} ms · {stamp(report.startedAt)}
          </p>
          {report.redirects?.length > 0 && (
            <p className="muted mono small">
              {report.redirects.map((r) => `${r.status} ${host(r.url)}`).join(' → ')} → {host(report.finalUrl)}
            </p>
          )}
          <div className="sev-row">
            {SEVERITIES.map((s) => (
              <span key={s} className={`sev-count sev-${s} ${report.counts[s] ? '' : 'zero'}`}>
                <strong>{report.counts[s]}</strong> {s}
              </span>
            ))}
          </div>
          <div className="report-meta">
            <span>
              <strong>{report.counts.pass}</strong> passed
            </span>
            <span>
              <strong>{report.counts.fail}</strong> failed
            </span>
            <span>
              <strong>{report.counts.skip}</strong> skipped
            </span>
            {report.tls && (
              <span className="mono">
                {report.tls.protocol} · {report.tls.issuer}
              </span>
            )}
          </div>
        </div>
        {trend?.length > 1 && (
          <div className="report-trend">
            <span className="muted small">score over {trend.length} scans</span>
            <Sparkline points={trend} width={180} height={48} />
          </div>
        )}
      </Card>

      <div className="report-grid">
        <Card title="By category">
          <CategoryBars report={report} categories={categories} />
        </Card>

        <Card
          title="Findings"
          actions={
            <div className="seg" role="tablist">
              {FILTERS.map((f) => (
                <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
          }
        >
          {categories.map((cat) => {
            const fs = shown.filter((f) => f.category === cat);
            if (!fs.length) return null;
            return (
              <div key={cat} className="finding-group">
                <h3>{cat}</h3>
                <ul>
                  {fs.map((f) => (
                    <FindingRow key={f.id} f={f} />
                  ))}
                </ul>
              </div>
            );
          })}
          {!shown.length && <p className="muted pad">Nothing {filter} in this report.</p>}
        </Card>
      </div>
    </div>
  );
}
