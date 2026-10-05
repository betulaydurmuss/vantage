async function call(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  meta: () => call('GET', '/meta'),
  stats: () => call('GET', '/stats'),
  scan: (url) => call('POST', '/scan', { url }),
  reports: (target) => call('GET', `/reports${target ? `?target=${encodeURIComponent(target)}` : ''}`),
  report: (id) => call('GET', `/reports/${id}`),
  deleteReport: (id) => call('DELETE', `/reports/${id}`),
  watch: () => call('GET', '/watch'),
  addWatch: (url) => call('POST', '/watch', { url }),
  removeWatch: (id) => call('DELETE', `/watch/${id}`),
  runWatch: () => call('POST', '/watch/run'),
};
