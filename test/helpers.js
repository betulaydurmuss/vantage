import http from 'node:http';

/** Starts an HTTP server with the given handler on a free port. */
export async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => server.close(r)) };
}

export const byId = (report, id) => report.findings.find((f) => f.id === id);
