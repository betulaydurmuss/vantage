import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { host, stamp } from '../format.js';
import { Card, Empty, ErrorNote, GradeBadge, Severity } from '../components/ui.jsx';

const label = (r) => `${r.grade} · ${host(r.target)} · ${stamp(r.startedAt)}`;

function Cell({ f }) {
  if (!f) return <td className="muted">–</td>;
  if (f.status === 'fail') {
    return (
      <td>
        <span className="cmp-fail">✗</span> <Severity level={f.severity} />
      </td>
    );
  }
  return <td className={f.status === 'pass' ? 'cmp-pass' : 'muted'}>{f.status === 'pass' ? '✓ pass' : '– skip'}</td>;
}

/** Side-by-side diff of two reports: which checks were fixed and which regressed. */
export default function Compare({ meta, params, go }) {
  const [list, setList] = useState(null);
  const [loadedA, setA] = useState(null);
  const [loadedB, setB] = useState(null);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [error, setError] = useState('');
  const aId = params.get('a');
  const bId = params.get('b');

  useEffect(() => {
    api.reports().then(setList, (e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (aId) api.report(aId).then(setA, (e) => setError(e.message));
  }, [aId]);
  useEffect(() => {
    if (bId) api.report(bId).then(setB, (e) => setError(e.message));
  }, [bId]);
  // A loaded report only counts while it is still the selected one.
  const a = loadedA?.id === aId ? loadedA : null;
  const b = loadedB?.id === bId ? loadedB : null;

  const pick = (key, id) => {
    const p = new URLSearchParams(params);
    if (id) p.set(key, id);
    else p.delete(key);
    go(`#/compare?${p}`);
  };

  const rows = useMemo(() => {
    if (!a || !b) return [];
    const byA = new Map(a.findings.map((f) => [f.id, f]));
    const byB = new Map(b.findings.map((f) => [f.id, f]));
    const ids = [...new Set([...byA.keys(), ...byB.keys()])];
    return ids.map((id) => {
      const fa = byA.get(id);
      const fb = byB.get(id);
      let change = 'same';
      if (fa?.status === 'fail' && fb?.status === 'pass') change = 'fixed';
      else if (fa?.status === 'pass' && fb?.status === 'fail') change = 'regressed';
      else if (fa?.status !== fb?.status || fa?.severity !== fb?.severity) change = 'changed';
      return { id, title: (fa ?? fb).title, category: (fa ?? fb).category, fa, fb, change };
    });
  }, [a, b]);

  const fixed = rows.filter((r) => r.change === 'fixed').length;
  const regressed = rows.filter((r) => r.change === 'regressed').length;
  const shown = onlyChanged ? rows.filter((r) => r.change !== 'same') : rows;

  if (list && list.length < 2) return <Empty title="Need two scans">Run at least two scans to compare them.</Empty>;

  return (
    <div className="stack">
      <ErrorNote error={error} />
      <Card>
        <div className="cmp-pickers">
          {[
            ['a', aId, 'Before'],
            ['b', bId, 'After'],
          ].map(([key, val, name]) => (
            <label key={key} className="cmp-picker">
              <span className="muted small">{name}</span>
              <select value={val ?? ''} onChange={(e) => pick(key, e.target.value)}>
                <option value="">Choose a report…</option>
                {(list ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {label(r)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Card>

      {a && b && (
        <>
          <div className="cmp-summary">
            <Card>
              <div className="cmp-side">
                <GradeBadge grade={a.grade} size="lg" />
                <div>
                  <strong className="mono">{host(a.target)}</strong>
                  <span className="muted small">score {a.score} · {stamp(a.startedAt)}</span>
                </div>
              </div>
            </Card>
            <div className="cmp-delta">
              <strong className={b.score - a.score >= 0 ? 'up' : 'down'}>
                {b.score - a.score >= 0 ? '+' : ''}
                {b.score - a.score}
              </strong>
              <span className="muted small">
                {fixed} fixed · {regressed} regressed
              </span>
            </div>
            <Card>
              <div className="cmp-side">
                <GradeBadge grade={b.grade} size="lg" />
                <div>
                  <strong className="mono">{host(b.target)}</strong>
                  <span className="muted small">score {b.score} · {stamp(b.startedAt)}</span>
                </div>
              </div>
            </Card>
          </div>

          <Card
            title="Checks"
            actions={
              <label className="toggle">
                <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> only changes
              </label>
            }
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Category</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {meta.categories.flatMap((cat) =>
                  shown
                    .filter((r) => r.category === cat)
                    .map((r) => (
                      <tr key={r.id}>
                        <td>{r.title}</td>
                        <td className="muted">{r.category}</td>
                        <Cell f={r.fa} />
                        <Cell f={r.fb} />
                        <td>
                          <span className={`tag tag-${r.change}`}>{r.change}</span>
                        </td>
                      </tr>
                    )),
                )}
              </tbody>
            </table>
            {!shown.length && <p className="muted pad">The two reports agree on every check.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
