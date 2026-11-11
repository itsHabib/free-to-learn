import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { input, join, request, state } from '../clients/http-client.mjs';
import { admitted, assertStaleOrderingInvariant, honestWin, probeStaleOrdering } from '../clients/scenarios.mjs';
import { raceTimeout, serverPath, startServer, withServer } from './harness.mjs';

test('a repeated deposit cannot increment score twice during cooldown', async () => {
  await withServer(async (server) => {
    const { actor, deposit } = await honestWin(server);
    assert.equal(deposit.tick, 14);
    await admitted(server.base, actor.token, 7, 'idle', true);
    await server.advance(1);
    const repeated = await state(server.base, actor.token);
    assert.equal(repeated.actor.score, 1, 'immediate repeat must not score twice');
    assert.equal(repeated.lastDecision.reason, 'cooldown');
  });
});

test('stale ordering cannot replace direction or stage an interaction', async () => {
  await withServer(async (server) => assertStaleOrderingInvariant(await probeStaleOrdering(server)));
});

test('staging coalesces interaction and lets the latest valid direction win', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    await admitted(server.base, actor.token, 1, 'E', true);
    const duplicate = await input(server.base, actor.token, 1, 'W', true);
    assert.equal(duplicate.data.status, 'stale');
    await admitted(server.base, actor.token, 2, 'W', true);
    await admitted(server.base, actor.token, 3, 'idle', false);
    await server.advance(1);
    const result = await state(server.base, actor.token);
    assert.deepEqual([result.actor.x, result.actor.y, result.actor.lastSeq], [1000, 1000, 3]);
    assert.deepEqual(result.lastDecision, { status: 'denied', reason: 'range', tick: 1 });
    await server.advance(1);
    assert.deepEqual((await state(server.base, actor.token)).lastDecision, result.lastDecision, 'pending interaction is consumed once');
    assert.equal(result.findings.length, 0, 'one coalesced denial is not three violations');
  });
});

test('intent expires after four ticks; state reads and retry traffic do not renew it', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    await admitted(server.base, actor.token, 1, 'E');
    await server.advance(4);
    const atExpiry = await state(server.base, actor.token);
    assert.deepEqual([atExpiry.actor.x, atExpiry.actor.expiresAt], [2000, 4]);
    assert.equal((await input(server.base, actor.token, 1, 'E')).data.status, 'stale');
    await server.advance(4);
    const stopped = await state(server.base, actor.token);
    assert.deepEqual([stopped.actor.x, stopped.actor.lastSeq, stopped.actor.expiresAt], [2000, 1, 4]);
    await admitted(server.base, actor.token, 2, 'E');
    await server.advance(1);
    assert.equal((await state(server.base, actor.token)).actor.x, 2250);
  });
});

test('same-tick renewal at expiry preserves movement without a gap', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    await admitted(server.base, actor.token, 1, 'E');
    await server.advance(4);
    await admitted(server.base, actor.token, 2, 'E');
    await server.advance(1);
    assert.equal((await state(server.base, actor.token)).actor.x, 2250);
  });
});

test('malformed and forged authoritative fields never consume sequence or mutate state', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    const initial = await state(server.base, actor.token);
    const valid = { v: 1, seq: 1, move: 'idle', interact: false };
    const forged = ['score', 'x', 'y', 'position', 'inventory', 'cargo', 'id', 'token', 'clientTime'];
    const cases = forged.map((key) => JSON.stringify({ ...valid, [key]: key === 'score' ? 999 : 'forged' }));
    cases.push('{', 'null', '[]', JSON.stringify({ ...valid, v: 2 }), JSON.stringify({ ...valid, seq: 1.5 }),
      JSON.stringify({ ...valid, seq: 0 }), JSON.stringify({ ...valid, seq: 1000001 }),
      JSON.stringify({ ...valid, seq: Number.MAX_SAFE_INTEGER + 1 }), JSON.stringify({ ...valid, move: 'NE' }),
      JSON.stringify({ ...valid, interact: 1 }), JSON.stringify({ v: 1, seq: 1, move: 'idle' }));
    for (const body of cases) {
      const response = await request(server.base, '/input', { method: 'POST', token: actor.token, body, headers: { 'Content-Type': 'application/json' } });
      assert.equal(response.status, 400, `malformed request must fail: ${body}`);
      assert.deepEqual(await state(server.base, actor.token), initial, 'rejected input must leave the entire snapshot unchanged');
    }
    await admitted(server.base, actor.token, 1, 'E');
    await server.advance(1);
    assert.equal((await state(server.base, actor.token)).actor.x, 1250);
  });
});

test('sessions isolate actors and targets; bearer token is the sole actor selector', async () => {
  await withServer(async (server) => {
    const alice = await join(server.base);
    const bob = await join(server.base);
    assert.notEqual(alice.id, bob.id);
    assert.notEqual(alice.token, bob.token);
    const beforeBob = await state(server.base, bob.token);
    await admitted(server.base, alice.token, 1, 'E');
    await server.advance(4);
    await admitted(server.base, alice.token, 2, 'E');
    await server.advance(2);
    await admitted(server.base, alice.token, 3, 'idle', true);
    await server.advance(1);
    const aliceState = await state(server.base, alice.token);
    const bobState = await state(server.base, bob.token);
    assert.deepEqual([aliceState.actor.x, aliceState.actor.cargo], [2500, true]);
    assert.equal(bobState.actor.x, 1000);
    assert.deepEqual(bobState.core, beforeBob.core);
    assert.deepEqual(Object.keys(aliceState).sort(), ['actor', 'arena', 'core', 'depot', 'findings', 'lastDecision', 'tick']);
    const serialized = JSON.stringify(aliceState);
    assert.ok(!serialized.includes(alice.token) && !serialized.includes(bob.token));
    assert.ok(!serialized.includes(bob.id), 'private snapshot must not reveal another actor');
    const forged = await request(server.base, '/input', { method: 'POST', token: alice.token, json: { v: 1, seq: 4, move: 'W', interact: false, id: bob.id } });
    assert.equal(forged.status, 400);
    assert.equal((await state(server.base, bob.token)).actor.lastSeq, 0);
    await join(server.base);
    await join(server.base);
    assert.equal((await request(server.base, '/join', { method: 'POST', json: {} })).status, 429);
  });
});

test('missing and invalid credentials cannot read or mutate gameplay', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    for (const token of [undefined, 'not-a-local-capability']) {
      assert.equal((await request(server.base, '/state', { token })).status, 401);
      assert.equal((await input(server.base, token, 1, 'E', true)).status, 401);
    }
    const own = await state(server.base, actor.token);
    assert.deepEqual([own.actor.lastSeq, own.actor.x, own.actor.cargo], [0, 1000, false]);
  });
});

test('wrong Host and Origin are refused before they can allocate a session', async () => {
  await withServer(async (server) => {
    const badHeaders = [
      { Host: 'example.invalid' }, { Host: '127.0.0.1:1' },
      { Origin: 'https://example.invalid' }, { Origin: `http://127.0.0.1:${server.port}.example.invalid` },
      { Origin: 'null' },
    ];
    for (const headers of badHeaders) {
      const response = await request(server.base, '/join', { method: 'POST', json: {}, headers });
      assert.ok([400, 403].includes(response.status), `boundary must reject ${JSON.stringify(headers)}`);
      assert.notEqual(response.headers['access-control-allow-origin'], '*');
    }
    for (let index = 0; index < 4; index += 1) await join(server.base);
    assert.equal((await request(server.base, '/join', { method: 'POST', json: {} })).status, 429);
  });
});

test('allowed loopback Host and Origin, 512-byte limit and JSON media type', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base, { headers: { Host: `localhost:${server.port}`, Origin: `http://localhost:${server.port}` } });
    const body = JSON.stringify({ v: 1, seq: 1, move: 'idle', interact: false });
    const exact = body.padEnd(512, ' ');
    assert.equal((await request(server.base, '/input', { method: 'POST', token: actor.token, body: exact, headers: { 'Content-Type': 'application/json', Origin: server.base } })).data.status, 'admitted');
    const oversized = await request(server.base, '/input', { method: 'POST', token: actor.token, body: exact + ' ', headers: { 'Content-Type': 'application/json' } });
    assert.equal(oversized.status, 413);
    for (const headers of [{}, { 'Content-Type': 'text/plain' }]) {
      const result = await request(server.base, '/input', { method: 'POST', token: actor.token, body, headers });
      assert.ok([400, 415].includes(result.status), 'JSON input requires application/json');
    }
    assert.equal((await state(server.base, actor.token)).actor.lastSeq, 1);
  });
});

test('HTTP requests cannot reach owner time, record, mutant or reset controls', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    for (const path of ['/advance', '/record', '/reset', '/mutant', '/shutdown']) {
      const result = await request(server.base, path, { method: 'POST', token: actor.token, json: { ticks: 100, mutant: 'omit-proximity' } });
      assert.ok([404, 405].includes(result.status));
    }
    assert.equal((await state(server.base, actor.token)).tick, 0);
  });
});

test('owner advance rejects invalid bounds and acknowledges only completed ticks', async () => {
  await withServer(async (server) => {
    for (const ticks of [0, -1, 101, 1.5, '1']) await assert.rejects(server.control('advance', { ticks }));
    assert.equal((await request(server.base, '/health')).data.tick, 0);
    const acknowledgement = await server.advance(100);
    assert.equal(acknowledgement.tick, 100);
    assert.equal((await request(server.base, '/health')).data.tick, 100);
  });
});

test('a wall blocks crossing its near edge without creating a finding', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    for (let seq = 1; seq <= 4; seq += 1) {
      await admitted(server.base, actor.token, seq, 'E');
      await server.advance(4);
    }
    const blocked = await state(server.base, actor.token);
    assert.deepEqual([blocked.actor.x, blocked.actor.y], [3750, 1000]);
    assert.deepEqual(blocked.findings, []);
  });
});

test('a legal detour clears the wall while the far wall edge remains solid', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    let seq = 0;
    for (const [move, ticks] of [['S', 4], ['S', 3], ['E', 4], ['E', 4], ['E', 4], ['E', 2], ['N', 4], ['N', 3]]) {
      await admitted(server.base, actor.token, ++seq, move);
      await server.advance(ticks);
    }
    assert.deepEqual([(await state(server.base, actor.token)).actor.x, (await state(server.base, actor.token)).actor.y], [4500, 1000]);
    await admitted(server.base, actor.token, ++seq, 'W');
    await server.advance(1);
    const stopped = await state(server.base, actor.token);
    assert.deepEqual([stopped.actor.x, stopped.actor.y], [4500, 1000]);
    assert.deepEqual(stopped.findings, []);
  });
});

test('the exact 250 mm interaction boundary succeeds, but 500 mm fails', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    await admitted(server.base, actor.token, 1, 'E');
    await server.advance(4);
    await admitted(server.base, actor.token, 2, 'idle', true);
    await server.advance(1);
    assert.equal((await state(server.base, actor.token)).lastDecision.reason, 'range');
    await admitted(server.base, actor.token, 3, 'E', true);
    await server.advance(1);
    const edge = await state(server.base, actor.token);
    assert.deepEqual([edge.actor.x, edge.actor.cargo], [2250, true]);
    assert.equal(edge.lastDecision.reason, 'pickup');
  });
});

test('legal delayed retry and blocked movement are excluded from findings', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    await admitted(server.base, actor.token, 10, 'W');
    await server.advance(4);
    assert.equal((await state(server.base, actor.token)).actor.x, 0);
    for (let index = 0; index < 6; index += 1) {
      assert.equal((await input(server.base, actor.token, 10, 'E', true)).data.status, 'stale');
      await server.advance(1);
    }
    await admitted(server.base, actor.token, 12, 'W');
    await server.advance(4);
    const result = await state(server.base, actor.token);
    assert.deepEqual([result.actor.x, result.actor.cargo, result.actor.score], [0, false, 0]);
    assert.deepEqual(result.findings, []);
    assert.equal(result.lastDecision, null);
  });
});

test('three range violations trigger advisory detection while legal movement continues', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    for (let seq = 1; seq <= 3; seq += 1) {
      await admitted(server.base, actor.token, seq, 'idle', true);
      await server.advance(1);
    }
    const caught = await state(server.base, actor.token);
    assert.deepEqual(caught.findings, [{ kind: 'repeated-invalid-action', tick: 3 }]);
    await admitted(server.base, actor.token, 4, 'E');
    await server.advance(1);
    const stillPlaying = await state(server.base, actor.token);
    assert.equal(stillPlaying.actor.x, 1250, 'advisory finding must not ban movement');
    assert.deepEqual([stillPlaying.actor.cargo, stillPlaying.actor.score], [false, 0]);
  });
});

test('violations outside the 20-tick detector window do not accumulate forever', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    await admitted(server.base, actor.token, 1, 'idle', true);
    await server.advance(21);
    for (let seq = 2; seq <= 3; seq += 1) {
      await admitted(server.base, actor.token, seq, 'idle', true);
      await server.advance(1);
    }
    assert.deepEqual((await state(server.base, actor.token)).findings, []);
  });
});

test('altered local rendering with equivalent valid traffic is a declared detector miss', async () => {
  await withServer(async (server) => {
    const ordinary = await join(server.base);
    const altered = await join(server.base);
    const localView = structuredClone(await state(server.base, altered.token));
    localView.actor.score = 999; // Deliberately never transmitted.
    const transcript = [[1, 'E', false, 4], [2, 'E', false, 2], [3, 'idle', true, 1]];
    for (const [seq, move, interact, ticks] of transcript) {
      await admitted(server.base, ordinary.token, seq, move, interact);
      await admitted(server.base, altered.token, seq, move, interact);
      await server.advance(ticks);
    }
    const left = await state(server.base, ordinary.token);
    const right = await state(server.base, altered.token);
    delete left.actor.id;
    delete right.actor.id;
    assert.deepEqual(left, right, 'server sees equivalent valid messages, not rendering behavior');
    assert.deepEqual(right.findings, []);
    assert.equal(right.actor.score, 0);
    assert.notEqual(right.actor.score, localView.actor.score, 'local display edits do not set authoritative score');
    assert.equal(right.actor.cargo, true);
  });
});

test('disconnect and token resume preserve sequence, position and expired intent', async () => {
  await withServer(async (server) => {
    const connection = new http.Agent({ keepAlive: true });
    const actor = await join(server.base, { agent: connection });
    try {
      await admitted(server.base, actor.token, 8, 'E');
      await server.advance(2);
      assert.equal((await state(server.base, actor.token, { agent: connection })).actor.x, 1500);
    } finally { connection.destroy(); }
    await server.advance(4);
    const resumed = await state(server.base, actor.token);
    assert.deepEqual([resumed.actor.x, resumed.actor.lastSeq, resumed.actor.expiresAt], [2000, 8, 4]);
    assert.equal((await input(server.base, actor.token, 8, 'W')).data.status, 'stale');
    await admitted(server.base, actor.token, 9, 'W');
    await server.advance(1);
    assert.equal((await state(server.base, actor.token)).actor.x, 1750);
  });
});

test('restart invalidates all previous process capabilities', async () => {
  const first = await startServer();
  let old;
  try { old = await join(first.base); } finally { await first.stop(); }
  await withServer(async (server) => {
    assert.equal((await request(server.base, '/state', { token: old.token })).status, 401);
    assert.equal((await input(server.base, old.token, 1, 'E')).status, 401);
    assert.notEqual((await join(server.base)).token, old.token);
  });
});

test('record replays ordered HTTP admissions and owner ticks without capability secrets', async () => {
  await withServer(async (server) => {
    const { actor } = await honestWin(server);
    await input(server.base, actor.token, 1, 'E', true);
    const record = await server.record();
    assert.equal(record.version, 1);
    assert.equal(record.seed, 17);
    assert.equal(record.dropped, 0);
    assert.ok(!JSON.stringify(record).includes(actor.token));
    assert.equal(record.events.filter((event) => event.type === 'join').length, 1);
    assert.equal(record.events.filter((event) => event.type === 'input').length, 7, 'parsed stale inputs are part of replay');
    assert.equal(record.events.filter((event) => event.type === 'tick').length, 14);
    const { replay } = await import('../engine.mjs');
    assert.deepEqual(replay(record), record.final);
    assert.deepEqual(record.final.actors, [await state(server.base, actor.token)]);
    const altered = structuredClone(record);
    altered.events.find((event) => event.type === 'input').input.move = 'W';
    assert.throws(() => replay(altered), /./, 'changed transition transcript must not match the recorded final state');
  });
});

test('bounded record explicitly refuses complete replay after history drops', async () => {
  await withServer(async (server) => {
    await join(server.base);
    for (let step = 0; step < 42; step += 1) await server.advance(100);
    const record = await server.record();
    assert.ok(record.events.length <= 4096);
    assert.ok(record.dropped > 0);
    const { replay } = await import('../engine.mjs');
    assert.throws(() => replay(record), /./);
  });
});

test('owner IPC disconnect and SIGTERM close listeners and exit cleanly', async () => {
  const disconnected = await startServer();
  try {
    disconnected.child.disconnect();
    assert.equal((await disconnected.waitForExit()).code, 0);
    await assert.rejects(request(disconnected.base, '/health'));
  } finally { await disconnected.stop(); }
  const signalled = await startServer();
  const heldConnection = new http.Agent({ keepAlive: true });
  try {
    const actor = await join(signalled.base, { agent: heldConnection });
    await state(signalled.base, actor.token, { agent: heldConnection });
    signalled.child.kill('SIGTERM');
    assert.equal((await signalled.waitForExit()).code, 0);
    await assert.rejects(request(signalled.base, '/health'));
  } finally {
    heldConnection.destroy();
    await signalled.stop();
  }
});

test('test flag without parent IPC and unknown options cannot start an unsafe server', async () => {
  for (const args of [['--test'], ['--mutant', 'omit-proximity'], ['--not-an-option']]) {
    const child = spawn(process.execPath, [serverPath, '--port', '0', ...args], { stdio: 'ignore' });
    try {
      const [code, signal] = await raceTimeout(once(child, 'exit'), 3000, 'Unsafe startup did not fail promptly.');
      assert.notEqual(code, 0);
      assert.equal(signal, null);
    } finally { if (child.exitCode === null) child.kill('SIGKILL'); }
  }
});

test('normal monotonic clock advances over real HTTP and stops on SIGTERM', async (t) => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    const before = await state(server.base, actor.token);
    await admitted(server.base, actor.token, 1, 'E');
    const deadline = performance.now() + 3000;
    let after = before;
    while (after.tick <= before.tick + 4 && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      after = await state(server.base, actor.token);
    }
    assert.ok(after.tick > before.tick + 4, 'normal runtime must advance without IPC');
    assert.equal(after.actor.x, 2000, 'normal runtime also expires a four-tick intent');
    assert.deepEqual(after.findings, []);
    t.diagnostic(`Real-clock smoke observed ticks ${before.tick}→${after.tick}; no exact wall-time guarantee asserted.`);
  }, { testMode: false });
});

test('100 bounded sequential HTTP state reads remain responsive', async (t) => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    const latencies = [];
    const started = performance.now();
    for (let index = 0; index < 100; index += 1) {
      const before = performance.now();
      await state(server.base, actor.token);
      latencies.push(performance.now() - before);
    }
    const elapsed = performance.now() - started;
    latencies.sort((a, b) => a - b);
    assert.ok(elapsed < 10000, 'local smoke must finish within its generous bounded budget');
    t.diagnostic(JSON.stringify({ requests: 100, totalMs: Number(elapsed.toFixed(2)), p50Ms: Number(latencies[49].toFixed(2)), p95Ms: Number(latencies[94].toFixed(2)), scope: 'local sequential smoke, not a capacity claim' }));
  });
});
