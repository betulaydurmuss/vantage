import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ago, gradeClass, host } from '../format.js';
import { Card, Empty, ErrorNote, GradeBadge, Sparkline } from '../components/ui.jsx';

export default function Watchlist({ meta, go }) {
  const [rows, setRows] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.watch().then(setRows, (e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      await api.addWatch(url);
      setUrl('');
      setError('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function runAll() {
    setBusy(true);
    try {
      setRows(await api.runWatch());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    await api.removeWatch(id).catch((err) => setError(err.message));
    load();
  }

  return (
    <div className="stack">
      <Card>
        <form className="scan-form" onSubmit={add}>
          <label htmlFor="watch-url" className="sr-only">
            URL to watch
          </label>
          <input id="watch-url" type="text" placeholder="Add a site to watch" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" className="btn">
            Watch
          </button>
          <button type="button" className="btn primary" onClick={runAll} disabled={busy || !rows?.length}>
            {busy ? 'Rescanning…' : 'Rescan all now'}
          </button>
        </form>
      </Card>
      <ErrorNote error={error} />
      {rows && !rows.length && <Empty title="Nothing watched">Watched sites are rescanned on a schedule and flagged when their grade drops.</Empty>}
      {rows?.length > 0 && (
        <div className="watch-grid">
          {rows.map((w) => {
            const drop = w.latest && w.previous && meta.grades.indexOf(w.latest.grade) < meta.grades.indexOf(w.previous.grade);
            const rise = w.latest && w.previous && meta.grades.indexOf(w.latest.grade) > meta.grades.indexOf(w.previous.grade);
            return (
              <Card key={w.id} className={`watch-card ${drop ? 'card-warn' : ''} ${gradeClass(w.latest?.grade)}`}>
                <div className="watch-top">
                  <GradeBadge grade={w.latest?.grade} size="lg" />
                  <div className="watch-info">
                    <strong className="mono">{host(w.target)}</strong>
                    <span className="muted small">
                      {w.latest ? `score ${w.latest.score} · ${w.latest.counts.fail} failed · ${ago(w.latest.startedAt)}` : 'not scanned yet'}
                    </span>
                    {drop && <span className="tag tag-bad">dropped from {w.previous.grade}</span>}
                    {rise && <span className="tag tag-good">up from {w.previous.grade}</span>}
                    {w.lastError && <span className="tag tag-bad">{w.lastError}</span>}
                  </div>
                </div>
                <Sparkline points={w.trend} width={260} height={44} />
                <div className="watch-actions">
                  {w.latest && (
                    <button type="button" className="btn small" onClick={() => go(`#/report/${w.latest.id}`)}>
                      Open report
                    </button>
                  )}
                  <button type="button" className="btn small ghost" onClick={() => remove(w.id)}>
                    Stop watching
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
