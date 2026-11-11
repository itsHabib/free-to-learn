import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { repair } from './policy.mjs';
import { addActor, initialState } from './state.mjs';

export class RequestRejection extends Error {
  constructor(message) { super(message); this.name = 'RequestRejection'; }
}

export function adaptRequest(state, actorId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'requestId') || !Object.hasOwn(body, 'stationId')) throw new RequestRejection('Send only requestId and stationId.');
  for (const key of ['requestId', 'stationId']) {
    if (typeof body[key] !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(body[key])) throw new RequestRejection('Request identifiers must use 1–40 letters, digits, underscore or hyphen.');
  }
  return { state, request: { requestId: body.requestId, stationId: body.stationId } };
}

async function readBody(request) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length <= 4096) chunks.push(chunk);
  }
  if (length > 4096) throw new RequestRejection('Request exceeds 4096 bytes.');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestRejection('Send a JSON body.'); }
}

function send(response, status, data, observationId) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Ivy-Capstone-Observation': observationId });
  response.end(JSON.stringify(data));
}

/** Local owner adapter. moveActor is a test control, never an HTTP endpoint. */
export async function createRepairServer({ policy = repair, requestAdapter = adaptRequest } = {}) {
  let world = initialState();
  const sessions = new Map();
  const trace = [];
  const observations = new Map();
  let requestCount = 0;
  const server = http.createServer(async (request, response) => {
    requestCount += 1;
    const observationId = randomUUID();
    const respond = (status, data) => {
      if (status === 200 && ['/state', '/repair'].includes(request.url)) observations.set(observationId, { route: request.url, status, data: structuredClone(data) });
      send(response, status, data, observationId);
    };
    if (requestCount > 256) return respond(429, { error: 'request-bound' });
    try {
      if (request.method === 'POST' && request.url === '/session') {
        const body = await readBody(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) return respond(400, { error: 'session-body' });
        if (sessions.size >= 8) return respond(429, { error: 'session-bound' });
        const id = `actor-${sessions.size + 1}`;
        const token = randomUUID();
        world = addActor(world, id);
        sessions.set(token, id);
        return respond(201, { id, token });
      }
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      const actorId = sessions.get(token);
      if (!actorId) return respond(401, { error: 'session' });
      if (request.method === 'GET' && request.url === '/state') return respond(200, structuredClone(world));
      if (request.method !== 'POST' || request.url !== '/repair') return respond(404, { error: 'route' });
      const body = await readBody(request);
      const adapted = requestAdapter(structuredClone(world), actorId, body);
      const result = policy(adapted.state, actorId, adapted.request);
      if (!result || !result.state || typeof result.reason !== 'string') throw new Error('Policy returned no usable state.');
      world = structuredClone(result.state);
      trace.push({ actorId, request: adapted.request, reason: result.reason, receipt: result.receipt, state: structuredClone(world) });
      return respond(200, result);
    } catch (error) {
      if (error instanceof RequestRejection) return respond(400, { error: error.message });
      respond(500, { error: 'policy-failure', name: error?.name ?? 'Error' });
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    moveActor(id, { x, y }) {
      if (![x, y].every((value) => Number.isSafeInteger(value) && Math.abs(value) <= 10000)) throw new RangeError('Owner positions must be integer coordinates within 10000 mm.');
      const actor = world.actors.find((item) => item.id === id);
      if (!actor) throw new Error('Unknown actor.');
      actor.x = x;
      actor.y = y;
    },
    snapshot: () => structuredClone(world),
    record: () => structuredClone(trace),
    observation: (id) => observations.get(id),
    activity: () => ({ requests: requestCount, stateReads: [...observations.values()].filter(({ route }) => route === '/state').length, repairRequests: trace.length }),
    close: () => new Promise((resolve, reject) => { server.closeAllConnections(); server.close((error) => error ? reject(error) : resolve()); }),
  };
}

export async function withRepairServer(exercise, options) {
  const server = await createRepairServer(options);
  try { return await exercise(server); }
  finally { await server.close(); }
}
