import { gradeClass } from '../format.js';

export function GradeBadge({ grade, size = 'md' }) {
  return <span className={`grade-badge ${size} ${gradeClass(grade)}`}>{grade ?? '–'}</span>;
}

/** A ring that fills with the score and shows the grade in the middle. */
export function GradeRing({ grade, score, size = 168 }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className={`grade-ring ${gradeClass(grade)}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="fill"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="grade-ring-label">
        <strong>{grade}</strong>
        <span>{score}/100</span>
      </div>
    </div>
  );
}

export function Severity({ level }) {
  return <span className={`sev sev-${level}`}>{level}</span>;
}

/** Inline score trend; one dot per scan, coloured by grade. */
export function Sparkline({ points, width = 120, height = 32 }) {
  if (!points?.length) return <span className="muted">–</span>;
  const pad = 4;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const y = (s) => height - pad - (s / 100) * (height - pad * 2);
  const xy = points.map((p, i) => [pad + i * step, y(p.score)]);
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`score trend, latest ${points.at(-1).score}`}>
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" />
      {xy.map(([x, yy], i) => (
        <circle key={i} cx={x} cy={yy} r={i === xy.length - 1 ? 3.5 : 2} className={gradeClass(points[i].grade)} />
      ))}
    </svg>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat ${tone ? `tone-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div className="error-note" role="alert">
      {error}
    </div>
  );
}
