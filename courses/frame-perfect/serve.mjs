// The lab server: serves the movie player and saves the movies you record in it.
// It serves only the player, the game core, the level files and work/movies/*.movie, and it writes only
// new files in work/movies/. It binds to 127.0.0.1 and refuses requests addressed to any other host.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const TYPES = {
  html: 'text/html; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  movie: 'text/plain; charset=utf-8',
};
const MAX_BODY = 200 * 1024;
const SAVE_NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;
const MOVIE_LINE = /^\|[L.][R.][J.]\|$/;
const PAGE_POLICY = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'";

// The URL of the player page for a movie or a level.
export function viewUrl(base, { level, movie, version, frame } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ level, movie, version, frame })) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return base.replace(/\/+$/, '') + '/game/view.html' + (query ? '?' + query : '');
}

// Which file on disk a request path names, or null. Only these shapes are served.
function fileFor(path, course, work) {
  if (path === '/game/view.html' || path === '/game/view.mjs' || path === '/game/draw.mjs' || path === '/game/core.mjs') {
    return join(course, path.slice(1));
  }
  const level = path.match(/^\/game\/levels\/([a-z0-9][a-z0-9-]{0,40})\.txt$/);
  if (level) return join(course, 'game', 'levels', level[1] + '.txt');
  const movie = path.match(/^\/work\/movies\/([A-Za-z0-9][A-Za-z0-9_-]{0,80})\.movie$/);
  if (movie) return join(work, 'movies', movie[1] + '.movie');
  return null;
}

// The reason a movie body is refused, or null when it is a movie.
export function movieProblem(text) {
  if (!text.startsWith('# Frame Perfect movie')) return 'a movie starts with the line "# Frame Perfect movie"';
  const lines = text.replace(/\r/g, '').split('\n');
  const start = lines.indexOf('inputs:');
  if (start < 0) return 'a movie needs a line "inputs:" before its frames';
  const bad = lines.slice(start + 1).findIndex((line) => line.trim() !== '' && !MOVIE_LINE.test(line.trim()));
  if (bad >= 0) return `line ${start + 2 + bad} is not a movie line like |.R.|`;
  return null;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(body);
}

async function serveFile(res, file, ext) {
  let bytes;
  try {
    bytes = await readFile(file);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return send(res, 404, 'not found\n');
    return send(res, 500, 'could not read the file\n');
  }
  const extra = ext === 'html' ? { 'Content-Security-Policy': PAGE_POLICY } : {};
  send(res, 200, bytes, { 'Content-Type': TYPES[ext], ...extra });
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => resolve(size > MAX_BODY ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

async function save(req, res, url, work) {
  const name = url.searchParams.get('name') ?? '';
  if (!SAVE_NAME.test(name)) return send(res, 400, 'a movie name is lowercase letters, digits and dashes, up to 41 characters, starting with a letter or digit\n');
  const text = await readBody(req);
  if (text === null) return send(res, 400, 'a movie must be under 200 kB\n');
  const problem = movieProblem(text);
  if (problem) return send(res, 400, problem + '\n');
  const dir = join(work, 'movies');
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name + '.movie'), text, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') return send(res, 409, `work/movies/${name}.movie already exists; choose another name\n`);
    return send(res, 500, 'could not write the movie\n');
  }
  send(res, 201, `saved work/movies/${name}.movie\n`);
}

// Requests must name this server by its loopback address, so a web page elsewhere cannot reach it
// through a renamed host, and a save must come from the player page itself.
function sameServer(req, port, shown) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `${shown}:${port}`];
  if (!hosts.includes(req.headers.host)) return false;
  const origin = req.headers.origin;
  return origin === undefined || hosts.some((h) => origin === `http://${h}`);
}

async function handle(req, res, { course, work, port, shown }) {
  if (!sameServer(req, port, shown)) return send(res, 400, 'use the 127.0.0.1 address the lab printed\n');
  const raw = req.url ?? '';
  const rawPath = raw.split('?')[0];
  if (rawPath.includes('..') || /%2e|%2f|%5c|%00|\\/i.test(rawPath)) return send(res, 400, 'that path is not allowed\n');
  const url = new URL(raw, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/save') return save(req, res, url, work);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'only GET, and POST /save\n', { Allow: 'GET, POST' });
  if (url.pathname === '/') return send(res, 302, 'the player is at /game/view.html\n', { Location: '/game/view.html' });
  const file = fileFor(url.pathname, course, work);
  if (!file) return send(res, 404, 'not found\n');
  return serveFile(res, file, url.pathname.slice(url.pathname.lastIndexOf('.') + 1));
}

export function startServer({ course, work, port = 0, host = '127.0.0.1' }) {
  if (!course || !work) throw new Error('startServer needs the course folder and the work folder');
  const shown = host.includes(':') ? `[${host}]` : host;
  const server = createServer((req, res) => {
    handle(req, res, { course, work, port: server.address().port, shown }).catch(() => send(res, 500, 'server error\n'));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const bound = server.address().port;
      const close = () => new Promise((done) => {
        server.close(() => done());
        server.closeAllConnections();
      });
      resolve({ url: `http://${shown}:${bound}`, close });
    });
  });
}
