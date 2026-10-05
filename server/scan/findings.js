// Findings, scoring and grading shared by every check.

export const Severity = Object.freeze({
  info: 'info',
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
});

export const Category = Object.freeze({
  transport: 'Transport',
  tls: 'TLS',
  headers: 'Headers',
  csp: 'Content Security Policy',
  cookies: 'Cookies',
  cors: 'CORS',
  exposure: 'Exposure',
  dns: 'DNS',
});

/** Display order of categories. */
export const CATEGORIES = Object.values(Category);

/** Score deducted for one failed check of each severity. */
export const PENALTY = { info: 0, low: 3, medium: 8, high: 18, critical: 40 };

const RANK = { none: 0, info: 1, low: 2, medium: 3, high: 4, critical: 5 };

export const GRADES = ['F', 'D', 'C', 'B', 'A', 'A+'];

export const pass = (id, category, title, detail = '') => ({ id, category, title, status: 'pass', detail });

export const skip = (id, category, title, detail = '') => ({ id, category, title, status: 'skip', detail });

export const fail = (id, category, severity, title, detail, fix) => ({
  id,
  category,
  title,
  status: 'fail',
  severity,
  detail,
  fix,
});

/** Ranks a grade from F (0) to A+ (5); unknown grades rank -1. */
export const gradeRank = (g) => GRADES.indexOf(g);

/**
 * Scores findings out of 100 and maps the score to a letter grade.
 * A+ additionally requires no failure above low severity, and a critical
 * failure caps the grade at D whatever the score.
 */
export function grade(findings) {
  const counts = { pass: 0, fail: 0, skip: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let score = 100;
  let worst = 'none';
  for (const f of findings) {
    counts[f.status]++;
    if (f.status !== 'fail') continue;
    counts[f.severity]++;
    score -= PENALTY[f.severity];
    if (RANK[f.severity] > RANK[worst]) worst = f.severity;
  }
  score = Math.max(0, score);

  let g;
  if (score >= 95 && RANK[worst] <= RANK.low) g = 'A+';
  else if (score >= 90) g = 'A';
  else if (score >= 80) g = 'B';
  else if (score >= 70) g = 'C';
  else if (score >= 60) g = 'D';
  else g = 'F';
  if (worst === 'critical' && gradeRank(g) > gradeRank('D')) g = 'D';

  return { score, grade: g, counts };
}

/** Sorts findings by category order, then failures first, then severity. */
export function sortFindings(findings) {
  const cat = Object.fromEntries(CATEGORIES.map((c, i) => [c, i]));
  const status = { fail: 0, pass: 1, skip: 2 };
  return [...findings].sort(
    (a, b) =>
      cat[a.category] - cat[b.category] ||
      status[a.status] - status[b.status] ||
      RANK[b.severity ?? 'none'] - RANK[a.severity ?? 'none'],
  );
}
