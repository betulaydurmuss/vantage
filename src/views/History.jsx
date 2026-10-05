import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { host, stamp } from '../format.js';
import { Card, Empty, ErrorNote, GradeBadge } from '../components/ui.jsx';

export default function History({ go }) {
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.reports().then(setRows, (e) => setError(e.message));
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => r.target.toLowerCase().includes(query.toLowerCase())), [rows, query]);

  async function remove(e, id) {
    e.stopPropagation();
    try {
      await api.deleteReport(id);
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!rows) return error ? <ErrorNote error={error} /> : <p className="muted">Loading…</p>;
  if (!rows.length) return <Empty title="No history yet">Every scan you run is stored here.</Empty>;

  return (
    <Card
      title={`${rows.length} scans`}
      actions={<input className="filter" type="search" placeholder="Filter by site" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter by site" />}
    >
      <ErrorNote error={error} />
      <table className="table">
        <thead>
          <tr>
            <th>Grade</th>
            <th>Site</th>
            <th className="num">Score</th>
            <th className="num">Critical</th>
            <th className="num">High</th>
            <th className="num">Medium</th>
            <th className="num">Low</th>
            <th>Scanned</th>
            <th className="num">Time</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id} className="clickable" onClick={() => go(`#/report/${r.id}`)}>
              <td>
                <GradeBadge grade={r.grade} size="sm" />
              </td>
              <td className="mono">{host(r.target)}</td>
              <td className="num">{r.score}</td>
              <td className={`num ${r.counts.critical ? 'sev-text-critical' : 'muted'}`}>{r.counts.critical}</td>
              <td className={`num ${r.counts.high ? 'sev-text-high' : 'muted'}`}>{r.counts.high}</td>
              <td className={`num ${r.counts.medium ? 'sev-text-medium' : 'muted'}`}>{r.counts.medium}</td>
              <td className={`num ${r.counts.low ? 'sev-text-low' : 'muted'}`}>{r.counts.low}</td>
              <td className="muted">{stamp(r.startedAt)}</td>
              <td className="num muted">{r.durationMs} ms</td>
              <td className="num">
                <button type="button" className="icon-btn" title="Delete report" aria-label={`Delete report for ${host(r.target)}`} onClick={(e) => remove(e, r.id)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
