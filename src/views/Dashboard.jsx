import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SEVERITIES, ago, gradeClass, host } from '../format.js';
import { Card, Empty, ErrorNote, GradeBadge, Severity, Stat } from '../components/ui.jsx';

export default function Dashboard({ meta, go }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.stats().then(setStats, (e) => setError(e.message));
  }, []);

  if (error) return <ErrorNote error={error} />;
  if (!stats) return <p className="muted">Loading…</p>;
  if (!stats.scans) {
    return (
      <Empty title="No scans yet">
        Run your first scan from the <a href="#/scan">Scan</a> view.
      </Empty>
    );
  }

  const maxGrade = Math.max(1, ...Object.values(stats.grades));
  const totalSev = SEVERITIES.reduce((s, k) => s + stats.severity[k], 0) || 1;

  return (
    <div className="stack">
      <div className="stats-row">
        <Stat label="Sites" value={stats.sites} hint={`${stats.scans} scans stored`} />
        <Stat label="Average score" value={stats.averageScore ?? '–'} hint="latest scan per site" />
        <Stat label="Watched" value={stats.watched} hint="rescanned on a schedule" />
        <Stat
          label="Critical + high"
          value={stats.severity.critical + stats.severity.high}
          hint="open across all sites"
          tone={stats.severity.critical + stats.severity.high ? 'bad' : 'good'}
        />
        <Stat label="Regressions" value={stats.regressions.length} hint="grade dropped since last scan" tone={stats.regressions.length ? 'warn' : 'good'} />
      </div>

      <div className="grid-2">
        <Card title="Grade distribution">
          <div className="grade-dist">
            {[...meta.grades].reverse().map((g) => (
              <div key={g} className="grade-col">
                <span className="grade-col-num">{stats.grades[g]}</span>
                <span className="grade-col-bar">
                  <span className={`grade-col-fill ${gradeClass(g)}`} style={{ height: `${(stats.grades[g] / maxGrade) * 100}%` }} />
                </span>
                <GradeBadge grade={g} size="sm" />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Open findings by severity">
          <div className="sev-stack" aria-hidden="true">
            {SEVERITIES.map((s) =>
              stats.severity[s] ? <span key={s} className={`sev-seg sev-bg-${s}`} style={{ flexGrow: stats.severity[s] / totalSev }} /> : null,
            )}
          </div>
          <ul className="sev-legend">
            {SEVERITIES.map((s) => (
              <li key={s}>
                <Severity level={s} />
                <strong>{stats.severity[s]}</strong>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Latest scans" actions={<a href="#/history">All history →</a>}>
          <table className="table">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Site</th>
                <th className="num">Score</th>
                <th className="num">Failed</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {stats.latest.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => go(`#/report/${r.id}`)}>
                  <td>
                    <GradeBadge grade={r.grade} size="sm" />
                  </td>
                  <td className="mono">{host(r.target)}</td>
                  <td className="num">{r.score}</td>
                  <td className="num">{r.counts.fail}</td>
                  <td className="muted">{ago(r.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Most common failures">
          {stats.topFailing.length ? (
            <ul className="top-failing">
              {stats.topFailing.map((f) => (
                <li key={f.id}>
                  <Severity level={f.severity} />
                  <span className="tf-title">
                    {f.title}
                    <span className="muted small"> · {f.category}</span>
                  </span>
                  <span className="tf-bar">
                    <span style={{ width: `${(f.sites / stats.sites) * 100}%` }} />
                  </span>
                  <span className="num small">
                    {f.sites}/{stats.sites}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted pad">Every site passes every check.</p>
          )}
        </Card>
      </div>

      {stats.regressions.length > 0 && (
        <Card title="Regressions" className="card-warn">
          <ul className="regressions">
            {stats.regressions.map((r) => (
              <li key={r.target}>
                <span className="mono">{host(r.target)}</span>
                <GradeBadge grade={r.from} size="sm" /> → <GradeBadge grade={r.to} size="sm" />
                <span className="muted">{ago(r.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
