// Dependency-free, read-only learner preview. No project, author, or arbitrary-directory route.
import { createServer } from 'node:http';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = realpathSync(dirname(fileURLToPath(import.meta.url)));
export const DEFAULT_PORT = 8129;
export const ASSETS = Object.freeze(["index.html", "checker.html", "diagrams/byte-layout.svg", "diagrams/commit-boundary.svg"]);
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };
function readAssets() {
  return new Map(ASSETS.map(name => {
    for (let n = 1; n <= name.split('/').length; n++) {
      const path = join(root, ...name.split('/').slice(0, n));
      if (lstatSync(path).isSymbolicLink()) throw Error('Learner assets must not be symlinks: ' + name);
    }
    const path = join(root, name), real = realpathSync(path);
    if (!real.startsWith(root + sep) || !lstatSync(path).isFile()) throw Error('Expected regular learner asset: ' + name);
    return ['/' + name, { bytes: readFileSync(path), type: types[name.slice(name.lastIndexOf('.'))] }];
  }));
}
function pathname(raw) {
  try {
    const value = decodeURIComponent(raw.split('?')[0]);
    if (!value.startsWith('/') || value.includes('\\') || value.includes('\0')) return null;
    if (value.split('/').some(part => part === '.' || part === '..')) return null;
    return value === '/' ? '/index.html' : value;
  } catch { return null; }
}
export async function startServer({ port = DEFAULT_PORT } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Port must be an integer from 0 through 65535. Use --port 0 for an available local port.');
  const assets = readAssets();
  const server = createServer((request, response) => {
    const host = '127.0.0.1:' + server.address().port;
    if (request.headers.host !== host) { response.writeHead(400); response.end('Use the printed 127.0.0.1 URL.'); return; }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Read-only learner preview.'); return; }
    const asset = assets.get(pathname(request.url));
    if (!asset) { response.writeHead(404); response.end('No learner asset at this path.'); return; }
    response.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': asset.bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    response.end(request.method === 'HEAD' ? undefined : asset.bytes);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]))) throw Error('Usage: node serve.mjs [--port PORT]. No host or directory option is supported.');
  const server = await startServer({ port: args.length ? Number(args[1]) : DEFAULT_PORT });
  const origin = 'http://127.0.0.1:' + server.address().port;
  console.log('Offline course reader: ' + origin + '/index.html\nProject checker: ' + origin + '/checker.html\nKeep this terminal open. Press Ctrl+C to stop. No internet connection is needed.');
  const stop = () => server.close(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error('Preview did not start: ' + (error.code === 'EADDRINUSE' ? 'Port is already in use. Stop your earlier preview or run node serve.mjs --port 0 and open its printed URL.' : error.message)); process.exitCode = 1; });
}
