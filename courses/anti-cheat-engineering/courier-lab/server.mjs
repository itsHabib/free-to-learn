import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { snapshot, events, canonical } from './engine.mjs';
import { createRecordedEngine } from './telemetry/runtime.mjs';
import { parseInput } from './protocol.mjs';
import { createClock, TICK_MS } from './clock.mjs';
import { createLearningHandler, createLearningService, LEARNING_ROUTES } from './learning/service.mjs';

const MAX_BODY_BYTES = 512;
const MAX_SESSIONS = 4;
const REQUEST_TIMEOUT_MS = 5_000;
const HEADER_TIMEOUT_MS = 6_000;
const ASSETS = new Map([
  ['/learn', ['learn.html', 'text/html; charset=utf-8']],
  ['/learn.html', ['learn.html', 'text/html; charset=utf-8']],
  ['/learn.js', ['learn.js', 'text/javascript; charset=utf-8']],
  ['/learn.css', ['learn.css', 'text/css; charset=utf-8']],
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/order', ['order.html', 'text/html; charset=utf-8']],
  ['/order.css', ['order.css', 'text/css; charset=utf-8']],
  ['/evidence', ['evidence.html', 'text/html; charset=utf-8']],
  ['/evidence.css', ['evidence.css', 'text/css; charset=utf-8']],
  ['/evidence.js', ['evidence.js', 'text/javascript; charset=utf-8']],
  ['/prediction-notebook.js', ['prediction-notebook.js', 'text/javascript; charset=utf-8']],
  ['/prediction-notebook.css', ['prediction-notebook.css', 'text/css; charset=utf-8']],
  ['/sources', ['sources.html', 'text/html; charset=utf-8']],
  ['/completion', ['completion.html', 'text/html; charset=utf-8']],
  ['/completion.js', ['completion.js', 'text/javascript; charset=utf-8']],
  ['/samples/completion-cases.json', ['samples/completion-cases.json', 'application/json; charset=utf-8']],
  ['/analysis', ['analysis.html', 'text/html; charset=utf-8']],
  ['/analysis.css', ['analysis.css', 'text/css; charset=utf-8']],
  ['/analysis.js', ['analysis.js', 'text/javascript; charset=utf-8']],
  ['/samples/analysis-cases.json', ['samples/analysis-cases.json', 'application/json; charset=utf-8']],
  ['/course', ['course.html', 'text/html; charset=utf-8']],
  ['/samples/evidence-cases.json', ['samples/evidence-cases.json', 'application/json; charset=utf-8']],
]);
const METHODS = new Map([
  ...LEARNING_ROUTES,
  ...Array.from(ASSETS.keys(), (route) => [route, 'GET']),
  ['/health', 'GET'], ['/state', 'GET'], ['/join', 'POST'], ['/input', 'POST'],
]);
const MUTANTS = new Set(['omit-proximity', 'omit-sequence']);

function numericOption(value, name, maximum) {
  if (!/^(0|[1-9]\d*)$/.test(value ?? '')) throw new Error(`Invalid ${name}.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum) throw new Error(`Invalid ${name}.`);
  return number;
}

function optionsFrom(argv) {
  const options = { port: 0, seed: 17, test: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (seen.has(flag)) throw new Error('Duplicate option.');
    seen.add(flag);
    if (flag === '--test') {
      options.test = true;
      continue;
    }
    if (flag === '--port') {
      options.port = numericOption(argv[++index], 'port', 65_535);
      continue;
    }
    if (flag === '--seed') {
      options.seed = numericOption(argv[++index], 'seed', Number.MAX_SAFE_INTEGER);
      continue;
    }
    if (flag === '--mutant') {
      options.mutant = argv[++index];
      if (!MUTANTS.has(options.mutant)) throw new Error('Unknown mutant.');
      continue;
    }
    throw new Error('Unknown option.');
  }
  if (options.test && (typeof process.send !== 'function' || !process.connected)) throw new Error('--test requires parent IPC.');
  if (options.mutant && !options.test) throw new Error('Mutants require --test and parent IPC.');
  return options;
}

function headerValues(request, name) {
  const values = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLowerCase() === name) values.push(request.rawHeaders[index + 1]);
  }
  return values;
}

function originAllowed(request, port) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const host = headerValues(request, 'host');
  if (host.length !== 1 || !hosts.has(host[0])) return false;
  const origin = headerValues(request, 'origin');
  const origins = new Set(Array.from(hosts, (value) => `http://${value}`));
  return origin.length === 0 || (origin.length === 1 && origins.has(origin[0]));
}

function json(response, status, body, extraHeaders = {}) {
  if (response.destroyed || response.writableEnded) return;
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': bytes.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  response.end(bytes);
}

function failure(status, reason) {
  return Object.assign(new Error(reason), { status, reason });
}

function hasBody(request) {
  return request.headers['transfer-encoding'] !== undefined || request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0';
}

function requireJson(request) {
  const values = headerValues(request, 'content-type');
  if (values.length !== 1 || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(values[0])) {
    throw failure(415, 'content-type');
  }
}

function readBody(request) {
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw failure(413, 'body-too-large');
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let finished = false;
    const timer = setTimeout(() => finish(failure(408, 'request-timeout')), REQUEST_TIMEOUT_MS);
    const onData = (chunk) => {
      length += chunk.length;
      if (length > MAX_BODY_BYTES) return finish(failure(413, 'body-too-large'));
      chunks.push(chunk);
    };
    const onEnd = () => finish(null, Buffer.concat(chunks).toString('utf8'));
    const onError = () => finish(failure(400, 'incomplete-body'));
    function finish(error, text) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onError);
      if (error) return reject(error);
      resolve(text);
    }
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    request.once('aborted', onError);
  });
}

function actorFor(request, sessions) {
  const values = headerValues(request, 'authorization');
  if (values.length !== 1) throw failure(401, 'unauthorized');
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(values[0]);
  const id = match && sessions.get(match[1]);
  if (!id) throw failure(401, 'unauthorized');
  return id;
}

function validJoinBody(text) {
  if (text.length === 0) return true;
  try {
    const value = JSON.parse(text);
    return value !== null && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).length === 0;
  } catch {
    return false;
  }
}

function ownerRequest(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
  const id = message.requestId;
  const validId = typeof id === 'string' && id.length > 0 && id.length <= 128 || Number.isSafeInteger(id) && id >= 0;
  if (!validId) return false;
  const keys = Object.keys(message).sort().join(',');
  if (message.type === 'advance') return keys === 'requestId,ticks,type' && Number.isSafeInteger(message.ticks) && message.ticks >= 1 && message.ticks <= 100;
  return ['record', 'window', 'shutdown'].includes(message.type) && keys === 'requestId,type';
}

function sendOwner(message) {
  if (!process.connected || typeof process.send !== 'function') return Promise.resolve();
  return new Promise((resolve) => process.send(message, () => resolve()));
}

async function main() {
  const options = optionsFrom(process.argv.slice(2));
  const recording = createRecordedEngine(options.seed, options.mutant ? { mutant: options.mutant } : {});
  const world = recording.world;
  const sessions = new Map();
  const transport = [];
  let port;
  let timer;
  let closing = false;
  const learning = createLearningHandler(createLearningService());
  const tick = () => canonical(world).tick;
  const logTransport = (route, status, reason) => {
    transport.push({ tick: tick(), route: METHODS.has(route) ? route : 'unknown', status, reason });
    if (transport.length > 128) transport.shift();
  };

  async function handle(request, response) {
    const route = request.url;
    try {
      if (closing) throw failure(503, 'shutting-down');
      if (!originAllowed(request, port)) throw failure(403, 'host-or-origin');
      const method = METHODS.get(route);
      if (!method) throw failure(404, 'not-found');
      if (request.method !== method) {
        json(response, 405, { error: 'method-not-allowed' }, { allow: method });
        logTransport(route, 405, 'method-not-allowed');
        request.resume();
        return;
      }
      if (method === 'GET' && hasBody(request)) throw failure(400, 'unexpected-body');
      if (LEARNING_ROUTES.has(route)) return await learning(request, response);
      if (route === '/health') return json(response, 200, { ok: true, tick: tick() });
      if (route === '/state') return json(response, 200, snapshot(world, actorFor(request, sessions)));
      if (route === '/input') {
        const id = actorFor(request, sessions);
        requireJson(request);
        const parsed = parseInput(await readBody(request));
        if (!parsed.ok) throw failure(400, parsed.reason);
        const decision = recording.admit(id, parsed.input);
        logTransport(route, 200, decision.status);
        return json(response, 200, decision);
      }
      if (route === '/join') {
        if (hasBody(request) || request.headers['content-type'] !== undefined) requireJson(request);
        if (!validJoinBody(await readBody(request))) throw failure(400, 'join-body');
        if (sessions.size >= MAX_SESSIONS) throw failure(429, 'session-limit');
        const actor = recording.join();
        const token = randomBytes(32).toString('base64url');
        sessions.set(token, actor.id);
        logTransport(route, 201, 'joined');
        return json(response, 201, { id: actor.id, token });
      }
      const [file, type] = ASSETS.get(route);
      const bytes = await readFile(new URL(`./public/${file}`, import.meta.url));
      response.writeHead(200, { 'content-type': type, 'content-length': bytes.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      response.end(bytes);
    } catch (error) {
      const status = error.status ?? 500;
      const reason = error.reason ?? 'internal-error';
      logTransport(route, status, reason);
      json(response, status, { error: reason });
      request.resume();
    }
  }

  // Node validates these two options together in its constructor. Set their
  // independent contract values afterwards; body reads also have a hard deadline.
  const server = http.createServer({ maxHeaderSize: 8_192, connectionsCheckingInterval: 1_000 }, (request, response) => {
    // An aborted body can emit an error after the body promise has settled.
    request.on('error', () => {});
    void handle(request, response);
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADER_TIMEOUT_MS;
  server.keepAliveTimeout = REQUEST_TIMEOUT_MS;
  server.maxConnections = 32;

  async function shutdown(code = 0, reply) {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    if (reply) await sendOwner(reply);
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    process.exit(code);
  }

  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
  process.once('disconnect', () => void shutdown());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', resolve);
  });
  port = server.address().port;
  server.removeAllListeners('error');
  server.on('error', () => {
    process.stderr.write('Server failure.\n');
    void shutdown(1);
  });
  if (!options.test) {
    const clock = createClock(performance.now());
    timer = setInterval(() => {
      try {
        const { ticks } = clock.sample(performance.now());
        if (ticks > 0) recording.advance(ticks);
      } catch {
        process.stderr.write('Clock failure.\n');
        void shutdown(1);
      }
    }, TICK_MS);
  }

  if (options.test) process.on('message', async (message) => {
    if (closing) return;
    if (!ownerRequest(message)) {
      const requestId = typeof message?.requestId === 'string' || Number.isSafeInteger(message?.requestId) ? message.requestId : null;
      await sendOwner({ requestId, ok: false, error: 'invalid-owner-message' });
      return;
    }
    try {
      if (message.type === 'advance') recording.advance(message.ticks);
      if (message.type === 'window') {
        await sendOwner({ requestId: message.requestId, ok: true, window: recording.window() });
        return;
      }
      if (message.type === 'record') {
        await sendOwner({ requestId: message.requestId, ok: true, record: events(world) });
        return;
      }
      if (message.type === 'shutdown') {
        await shutdown(0, { requestId: message.requestId, ok: true, tick: tick() });
        return;
      }
      await sendOwner({ requestId: message.requestId, ok: true, tick: tick() });
    } catch {
      await sendOwner({ requestId: message.requestId, ok: false, error: 'owner-operation-failed' });
    }
  });

  const ready = { type: 'ready', port };
  process.stdout.write(`${JSON.stringify(ready)}\n`);
  if (!options.test) process.stdout.write(`Open http://127.0.0.1:${port}/learn for the guided course.\n`);
  await sendOwner(ready);
}

main().catch((error) => {
  process.stderr.write(`Server startup failed: ${error.message}\n`);
  process.exit(1);
});
