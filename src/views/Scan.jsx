import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Report from '../components/Report.jsx';
import { Card, ErrorNote } from '../components/ui.jsx';

/** Scan a URL, or show a stored report when `reportId` is set. */
export default function Scan({ meta, reportId, go, initialUrl = '' }) {
  const [url, setUrl] = useState(initialUrl);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    api.report(reportId).then(
      (r) => {
        setReport(r);
        setUrl(r.target);
      },
      (e) => setError(e.message),
    );
  }, [reportId]);

  async function run(e, target = url) {
    e?.preventDefault();
    if (!target.trim()) return;
    setBusy(true);
    setError('');
    setWatched(false);
    try {
      const r = await api.scan(target);
      go(`#/report/${r.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function watch() {
    try {
      await api.addWatch(report.target);
      setWatched(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <Card>
        <form className="scan-form" onSubmit={run}>
          <label htmlFor="target" className="sr-only">
            URL to scan
          </label>
          <input
            id="target"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck="false"
            placeholder="example.com or https://example.com/login"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Scanning…' : 'Scan'}
          </button>
        </form>
        {meta.demo.length > 0 && (
          <div className="demo-links">
            <span className="muted small">Demo sites:</span>
            {meta.demo.map((s) => (
              <button key={s.name} type="button" className="chip" disabled={busy} onClick={() => run(null, s.url)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        {busy && (
          <div className="progress" aria-live="polite">
            <span /> Checking transport, TLS, headers, CSP, cookies, CORS, exposed files and DNS…
          </div>
        )}
      </Card>

      <ErrorNote error={error} />

      {report && !busy && (
        <>
          <div className="report-actions">
            <button type="button" className="btn" onClick={() => run(null, report.target)}>
              Rescan
            </button>
            <button type="button" className="btn" onClick={watch} disabled={watched}>
              {watched ? 'Watching' : 'Add to watchlist'}
            </button>
            <button type="button" className="btn" onClick={() => go(`#/compare?a=${report.id}`)}>
              Compare…
            </button>
            <a className="btn" href={`/api/reports/${report.id}`} target="_blank" rel="noreferrer">
              JSON
            </a>
          </div>
          <Report report={report} categories={meta.categories} trend={report.trend} />
        </>
      )}
    </div>
  );
}
