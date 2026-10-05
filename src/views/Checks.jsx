import { Card, Severity } from '../components/ui.jsx';

/** Reference of every check, grouped by category, with the worst severity it reports. */
export default function Checks({ meta }) {
  return (
    <div className="stack">
      <p className="muted lead">
        vantage runs {meta.catalog.length} checks in {meta.categories.length} categories. Each failure deducts from a score of 100 by severity
        (critical 40, high 18, medium 8, low 3, info 0); A+ also requires no failure above low, and any critical failure caps the grade at D.
      </p>
      <div className="checks-grid">
        {meta.categories.map((cat) => (
          <Card key={cat} title={cat}>
            <ul className="check-list">
              {meta.catalog
                .filter((c) => c.category === cat)
                .map((c) => (
                  <li key={c.id}>
                    <div className="check-head">
                      <strong>{c.title}</strong>
                      <Severity level={c.max} />
                    </div>
                    <p className="muted small">{c.why}</p>
                    <code className="finding-id">{c.id}</code>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
