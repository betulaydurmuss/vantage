import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { ErrorNote } from './components/ui.jsx';
import Checks from './views/Checks.jsx';
import Compare from './views/Compare.jsx';
import Dashboard from './views/Dashboard.jsx';
import History from './views/History.jsx';
import Scan from './views/Scan.jsx';
import Watchlist from './views/Watchlist.jsx';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z' },
  { key: 'scan', label: 'Scan', icon: 'M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.4-5.4-5.38A8 8 0 1 1 10 2m0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12' },
  { key: 'history', label: 'History', icon: 'M13 3a9 9 0 1 1-8.95 10h2.02A7 7 0 1 0 13 5a7 7 0 0 0-5.6 2.8L10 10H3V3l2.94 2.94A9 9 0 0 1 13 3m-1 5h1.5v4.25l3.5 2.08-.75 1.23L12 13z' },
  { key: 'watch', label: 'Watchlist', icon: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10m0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6' },
  { key: 'compare', label: 'Compare', icon: 'M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v2h2V1h-2zm0 15H5l5-6zm9-15h-5v2h5v13l-5-6v9h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2' },
  { key: 'checks', label: 'Checks', icon: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' },
];

const TITLES = {
  dashboard: ['Dashboard', 'Security posture across every site you have scanned'],
  scan: ['Scan', 'Grade a site on transport, TLS, headers, CSP, cookies, CORS, exposure and DNS'],
  report: ['Report', 'Every check, what failed and how to fix it'],
  history: ['History', 'Every stored scan, newest first'],
  watch: ['Watchlist', 'Sites rescanned on a schedule, flagged when their grade drops'],
  compare: ['Compare', 'Diff two reports: what was fixed and what regressed'],
  checks: ['Checks', 'The reference for every check vantage runs'],
};

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [pathPart, query = ''] = raw.split('?');
  const [view, id] = pathPart.split('/');
  return { view: TITLES[view] ? view : 'dashboard', id, params: new URLSearchParams(query) };
}

function Logo() {
  return (
    <a href="#/dashboard" className="logo" aria-label="vantage home">
      <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
        <path d="M14 18 L32 48 L50 18" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32" cy="22" r="5" fill="currentColor" />
      </svg>
      <span>vantage</span>
    </a>
  );
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    api.meta().then(setMeta, (e) => setError(`cannot reach the vantage API: ${e.message}`));
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((hash) => {
    window.location.hash = hash;
  }, []);

  const active = route.view === 'report' ? 'scan' : route.view;
  const [title, subtitle] = TITLES[route.view];

  let body = null;
  if (meta) {
    switch (route.view) {
      case 'scan':
        body = <Scan meta={meta} go={go} initialUrl={route.params.get('url') ?? ''} />;
        break;
      case 'report':
        body = <Scan meta={meta} go={go} reportId={route.id} />;
        break;
      case 'history':
        body = <History go={go} />;
        break;
      case 'watch':
        body = <Watchlist meta={meta} go={go} />;
        break;
      case 'compare':
        body = <Compare meta={meta} params={route.params} go={go} />;
        break;
      case 'checks':
        body = <Checks meta={meta} />;
        break;
      default:
        body = <Dashboard meta={meta} go={go} />;
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo />
        <nav>
          {NAV.map((n) => (
            <a key={n.key} href={`#/${n.key}`} className={active === n.key ? 'active' : ''} aria-current={active === n.key ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d={n.icon} fill="currentColor" />
              </svg>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot muted small">
          {meta ? `${meta.catalog.length} checks · ${meta.categories.length} categories` : ''}
        </div>
      </aside>
      <main className="main">
        <header className="page-head">
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </header>
        <ErrorNote error={error} />
        {/* Keyed by the route so each navigation starts the view with fresh state. */}
        <div key={`${route.view}/${route.id ?? ''}`}>{body}</div>
      </main>
    </div>
  );
}
