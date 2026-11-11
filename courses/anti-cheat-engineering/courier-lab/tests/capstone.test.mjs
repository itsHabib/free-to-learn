import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repair } from '../capstone/policy.mjs';
import { initialState, addActor } from '../capstone/state.mjs';
import { assess, assessPolicy, cases, runScenario } from '../capstone/fixtures.mjs';
import { correctPolicies, wrongPolicies, wrongAdapters } from '../capstone/controls.mjs';
import { createRepairServer, withRepairServer } from '../capstone/server.mjs';
import { request, session, submit, state } from '../capstone/client.mjs';
import * as template from '../capstone/template.mjs';

const actor = (world, id) => world.actors.find((item) => item.id === id);
const body = { requestId: 'once', stationId: 'alpha' };
const scenarioPath = fileURLToPath(new URL('../capstone/author-scenario.mjs', import.meta.url));
const policyPath = fileURLToPath(new URL('../capstone/policy.mjs', import.meta.url));
const controlsUrl = new URL('../capstone/controls.mjs', import.meta.url).href;
const clientUrl = new URL('../capstone/client.mjs', import.meta.url).href;

async function source(t, code, name = 'scenario.mjs') {
  const directory = await mkdtemp(join(tmpdir(), 'ivy-capstone-scenario-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, name);
  await writeFile(path, code);
  return path;
}

test('pure reference and two independently structured correct policies pass all keyed cases', () => {
  assert.equal(cases().length, 16);
  assert.equal(assessPolicy({ repair }).passed, true);
  assert.equal(correctPolicies.length, 2);
  for (const control of correctPolicies) assert.equal(assessPolicy(control).passed, true, control.name);
  const source = addActor(initialState(), 'actor-1');
  const original = structuredClone(source);
  const result = repair(source, 'actor-1', body);
  result.state.actors[0].energy = 99;
  result.receipt.credits = -10;
  assert.deepEqual(source, original);
});

test('fifteen distinct wrong policy controls fail with intended expected/actual feedback', () => {
  assert.equal(wrongPolicies.length, 15);
  for (const control of wrongPolicies) {
    const result = assessPolicy(control);
    assert.equal(result.passed, false, control.name);
    const failure = result.criteria.find((item) => !item.passed && item.name.includes(control.intended));
    assert.ok(failure, `${control.name}: missing intended ${control.intended} failure`);
    assert.ok(Object.hasOwn(failure.error, 'expected'));
    assert.ok(Object.hasOwn(failure.error, 'actual'));
    assert.match(failure.error.source, /^LEARNER\.md#/);
  }
  assert.equal(assessPolicy(template).passed, false);
  assert.equal(assessPolicy({}).passed, false);
  assert.equal(assessPolicy({ repair: async (...args) => repair(...args) }).passed, false);
});

test('source immutability, scoped receipts, caps, funds and check ordering are executable', () => {
  const source = addActor(addActor(initialState(), 'actor-1'), 'actor-2');
  const first = repair(source, 'actor-1', body);
  const second = repair(first.state, 'actor-2', body);
  assert.equal(second.reason, 'repaired');
  assert.equal(actor(second.state, 'actor-2').credits, 4);
  assert.equal(actor(second.state, 'actor-1').credits, 4);
  const limited = structuredClone(first.state);
  limited.config.receiptLimit = 1;
  Object.assign(actor(limited, 'actor-1'), { x: 9999, energy: 10, credits: 0 });
  assert.equal(repair(limited, 'actor-1', { requestId: 'new', stationId: 'alpha' }).reason, 'history-full');
  assert.equal(repair(limited, 'actor-1', { requestId: 'new', stationId: 'missing' }).reason, 'station');
  assert.equal(repair(limited, 'actor-1', body).reason, 'duplicate');
  assert.equal(repair(limited, 'actor-1', { ...body, stationId: 'missing' }).reason, 'conflict');
});

test('fresh HTTP runs include the submitted policy, two correct controls and thirteen wrong variants', async () => {
  const result = await assess({ repair, policyPath, scenarioPath });
  assert.equal(result.passed, true, JSON.stringify(result.criteria.filter((item) => !item.passed)));
  const http = result.criteria.filter((item) => item.name.startsWith('HTTP scenario:'));
  assert.equal(http.length, 16);
  assert.ok(http.every(({ passed }) => passed));
});

test('empty, blanket-failing and crashing scenarios do not pass the independent test-quality gate', async (t) => {
  const emptyPath = await source(t, 'export async function scenario() {}');
  const empty = await assess({ repair, policyPath, scenarioPath: emptyPath });
  assert.equal(empty.passed, false);
  assert.equal(empty.criteria.filter((item) => !item.passed && item.name.startsWith('HTTP scenario:')).length, 16);
  const blanketPath = await source(t, "import assert from 'node:assert/strict'; export async function scenario() { assert.fail('always fails'); }");
  const blanket = await assess({ repair, policyPath, scenarioPath: blanketPath });
  assert.equal(blanket.passed, false);
  // A genuine assertion may end a wrong run early. Blanket failure is rejected
  // by all three required correct runs, rather than field/read instrumentation.
  const blanketHttp = blanket.criteria.filter(item => item.name.startsWith('HTTP scenario:'));
  assert.equal(blanketHttp.filter(item => !item.passed).length, 3);
  assert.ok(blanketHttp.slice(0, 3).every(item => !item.passed));
  const crashPath = await source(t, "export async function scenario() { throw new Error('not an assertion'); }");
  const crashed = await runScenario(crashPath);
  assert.equal(crashed.status, 'runtime-failure');
  assert.equal((await runScenario(fileURLToPath(new URL('../capstone/scenario-template.mjs', import.meta.url)))).status, 'runtime-failure');
  const absent = await assess({ repair });
  assert.equal(absent.criteria.at(-1).name, 'captured policy and independent HTTP scenario');
});

test('real simultaneous duplicate requests debit once and return the original receipt after movement', async () => {
  await withRepairServer(async (server) => {
    const player = await session(server.base);
    const replies = await Promise.all([submit(server.base, player.token, body), submit(server.base, player.token, body)]);
    assert.deepEqual(replies.map((reply) => reply.data.reason).sort(), ['duplicate', 'repaired']);
    assert.deepEqual(replies[0].data.receipt, replies[1].data.receipt);
    const after = await state(server.base, player.token);
    assert.deepEqual([actor(after, player.id).energy, actor(after, player.id).credits, actor(after, player.id).receipts.length], [7, 4, 1]);
    server.moveActor(player.id, { x: 1000, y: 0 });
    const beforeRetry = await state(server.base, player.token);
    const retry = await submit(server.base, player.token, body);
    assert.equal(retry.data.reason, 'duplicate');
    assert.deepEqual(retry.data.receipt, replies[0].data.receipt);
    assert.deepEqual(retry.data.state, beforeRetry);
    assert.doesNotMatch(JSON.stringify(server.record()), new RegExp(player.token));
  });
});

test('real HTTP rejects client authority claims, malformed bodies and unknown sessions without changing state', async () => {
  await withRepairServer(async (server) => {
    const player = await session(server.base);
    const before = server.snapshot();
    for (const field of ['x', 'y', 'energy', 'credits', 'price', 'score', 'actorId', 'timestamp', 'counter']) {
      const reply = await submit(server.base, player.token, { ...body, [field]: 100 });
      assert.equal(reply.status, 400, field);
      assert.deepEqual(server.snapshot(), before, field);
    }
    for (const value of [null, [], 4, {}, { requestId: '', stationId: 'alpha' }, { ...body, requestId: 'x'.repeat(5000) }]) {
      assert.equal((await submit(server.base, player.token, value)).status, 400);
      assert.deepEqual(server.snapshot(), before);
    }
    assert.equal((await request(server.base, '/repair', { method: 'POST', json: body })).status, 401);
    assert.equal((await submit(server.base, 'unknown', body)).status, 401);
    assert.equal((await request(server.base, '/owner/move', { method: 'POST', token: player.token, json: { x: 0, y: 0 } })).status, 404);
    assert.deepEqual(server.snapshot(), before);
    for (const value of [1, true, null, [], { energy: 0 }]) assert.equal((await request(server.base, '/session', { method: 'POST', json: value })).status, 400);
  });
});

test('sessions and owner movement have explicit bounds and fresh snapshots', async () => {
  const server = await createRepairServer();
  try {
    const first = await session(server.base);
    const detached = server.snapshot();
    server.moveActor(first.id, { x: 400, y: -300 });
    assert.deepEqual([actor(detached, first.id).x, actor(detached, first.id).y], [0, 0]);
    assert.throws(() => server.moveActor(first.id, { x: 10001, y: 0 }), /within/);
    assert.throws(() => server.moveActor('unknown', { x: 0, y: 0 }), /Unknown/);
    for (let index = 1; index < 8; index += 1) await session(server.base);
    assert.equal((await request(server.base, '/session', { method: 'POST', json: {} })).status, 429);
  } finally { await server.close(); }
  assert.throws(() => request('https://example.com', '/state'), /loopback/);
});

test('the author HTTP scenario detects acceptance of forbidden client claims', async () => {
  const result = await runScenario(scenarioPath, { variant: wrongAdapters[0].name });
  assert.equal(result.status, 'assertion-failure');
  assert.equal(result.error.actual, 200);
  assert.equal(result.error.expected, 400);
});

test('the module-counter false pass has no valid HTTP evidence in any fresh process', async (t) => {
  const counter = await source(t, `import assert from 'node:assert/strict'; let count = 0; export async function scenario() { count += 1; if (count <= 2) return; assert.fail('control count'); }`);
  const result = await assess({ repair, policyPath, scenarioPath: counter });
  const http = result.criteria.filter((item) => item.name.startsWith('HTTP scenario:'));
  assert.equal(http.length, 16);
  assert.ok(http.every((item) => !item.passed));
  assert.ok(http.every((item) => item.error.actual.status === 'insufficient-evidence'));
  assert.ok(http.every((item) => item.error.actual.activity.requests === 0));
});

test('helper module state is fresh per case and the submitted policy really runs', async (t) => {
  const helper = await source(t, `import {scenario as author} from ${JSON.stringify(new URL('../capstone/author-scenario.mjs', import.meta.url).href)}; let count=0; export async function run(options) { if (++count !== 1) throw new Error('module cache reused'); return author(options); }`, 'helper.mjs');
  const path = join(helper, '..', 'scenario.mjs');
  await writeFile(path, "import {run} from './helper.mjs'; export const scenario = run;");
  assert.equal((await assess({ repair, policyPath, scenarioPath: path })).passed, true);
  const badPolicy = await source(t, `import {wrongPolicies} from ${JSON.stringify(controlsUrl)}; export const repair = wrongPolicies.find(({name}) => name === 'globally scoped request IDs').repair;`, 'policy.mjs');
  const result = await assess({ repair, policyPath: badPolicy, scenarioPath });
  const integration = result.criteria.find((item) => item.name === 'HTTP scenario: submitted policy with captured scenario');
  assert.equal(integration.passed, false);
  assert.equal(integration.error.actual.status, 'assertion-failure');
  assert.ok(result.criteria.filter((item) => item.name.startsWith('HTTP scenario:') && item !== integration).every((item) => item.passed));
});

test('forged assertion codes remain runtime failures even after real HTTP state assertions', async (t) => {
  const path = await source(t, `import assert from 'node:assert/strict'; import {session, state, submit} from ${JSON.stringify(clientUrl)};
    export async function scenario({base}) { const player=await session(base); const before=await state(base,player.token); assert.deepEqual(before.actors[0], {id:player.id,x:0,y:0,energy:4,credits:6,receipts:[]}); await submit(base,player.token,{requestId:'x',stationId:'alpha'}); throw Object.assign(new Error('forged'), {code:'ERR_ASSERTION',name:'AssertionError',actual:1,expected:2}); }`);
  const result = await runScenario(path);
  assert.equal(result.status, 'runtime-failure');
  assert.ok(result.activity.stateReads > 0);

  assert.equal(result.error.message, 'forged');
});

test('participation is not assertion-quality proof; a strings-only scenario fails the full panel', async (t) => {
  const path = await source(t, `import assert from 'node:assert/strict'; import {session, state, submit} from ${JSON.stringify(clientUrl)};
    export async function scenario({base}) { const player=await session(base); await state(base,player.token); const response=await submit(base,player.token,{requestId:'x',stationId:'alpha'}); assert.equal(response.data.reason,'repaired'); }`);
  const result = await assess({ repair, policyPath, scenarioPath: path });
  assert.equal(result.passed, false);
  assert.ok(result.criteria.some((item) => !item.passed && item.name.startsWith('HTTP scenario:')));
});

test('a timed out scenario is a runner failure and its child is terminated', async (t) => {
  const path = await source(t, 'export async function scenario() { await new Promise(() => {}); }');
  const result = await runScenario(path, { timeout: 150 });
  assert.equal(result.status, 'runner-failure');
  assert.match(result.error.message, /timed out/);
});

test('rewriting received data does not satisfy the complete behavioral panel', async (t) => {
  const path = await source(t, `import assert from 'node:assert/strict'; import {session, state, submit} from ${JSON.stringify(clientUrl)};
    export async function scenario({base}) { const player=await session(base); await submit(base,player.token,{requestId:'x',stationId:'alpha'}); const observed=await state(base,player.token); observed.actors[0].energy=999; observed.actors[0].credits=999; observed.actors[0].receipts=[]; assert.deepEqual(observed.actors[0], {id:player.id,x:0,y:0,energy:999,credits:999,receipts:[]}); }`);
  assert.equal((await assess({ repair, policyPath, scenarioPath: path })).passed, false);
});

test('custom scalar and named-import assertions work through a captured helper module', async (t) => {
  const helper = await source(t, `import {strictEqual as same, deepStrictEqual as sameShape} from 'node:assert/strict'; import {session, state, submit} from ${JSON.stringify(clientUrl)};
    export async function inspect({base}) { const player=await session(base); const first=await state(base,player.token); const actor=first.actors.find(item=>item.id===player.id); same(actor.energy,4); same(actor.credits,6); same(actor.receipts.length,0); const response=await submit(base,player.token,{requestId:'custom',stationId:'alpha'}); const after=response.data.state.actors.find(item=>item.id===player.id); same(after.energy,7); same(after.credits,4); sameShape(after.receipts,[response.data.receipt]); }`, 'helper.mjs');
  const path = join(helper, '..', 'scenario.mjs');
  await writeFile(path, "import {inspect} from './helper.mjs'; export const scenario = inspect;");
  for (const variant of correctPolicies.map(({ name }) => name)) {
    const result = await runScenario(path, { variant });
    assert.equal(result.status, 'passed', JSON.stringify(result));
  }
});

test('the absolute panel deadline kills and reaps the active child before skipping remaining cases', async (t) => {
  const path = await source(t, 'export async function scenario() { await new Promise(() => {}); }');
  await assert.rejects(assess({ repair, policyPath, scenarioPath: path }, { timeout: 1000, budget: 150 }), { name: 'ScenarioRunnerError', message: /timed out|budget exhausted/ });
  const single = await runScenario(path, { timeout: 1000, deadline: Date.now() + 150 });
  assert.equal(single.exit.signal, 'SIGKILL');
});

test('unchanged cold learner scenario can clone expected state and passes every isolated variant', async () => {
  const coldPath = fileURLToPath(new URL('../capstone/author-cold-clone-scenario.mjs', import.meta.url));
  const result = await assess({ repair, policyPath, scenarioPath: coldPath });
  assert.equal(result.passed, true, JSON.stringify(result.criteria.filter((item) => !item.passed)));
});

test('structuredClone preserves observed JSON, nested aliases, cycles and native transfer behavior', async (t) => {
  const path = await source(t, `import assert from 'node:assert/strict'; import {session,state,submit} from ${JSON.stringify(clientUrl)};
    export async function scenario({base}) {
      const player=await session(base);
      const before=await state(base,player.token);
      const expected=structuredClone(before);
      expected.actors[0].energy=7; expected.actors[0].credits=4;
      const receipt={requestId:'clone',stationId:'alpha',energyAdded:3,creditsSpent:2,energy:7,credits:4};
      expected.actors[0].receipts.push(receipt);
      assert.equal(before.actors[0].energy,4); assert.equal(before.actors[0].credits,6); assert.deepEqual(before.actors[0].receipts,[]);
      const outer={before,alias:before}; outer.self=outer;
      const detached=structuredClone(outer);
      assert.equal(detached.self,detached); assert.equal(detached.before,detached.alias);
      assert.notEqual(detached.before,before); assert.deepEqual(detached.before,before);
      const buffer=new ArrayBuffer(4);
      const mixed=structuredClone({before,buffer,date:new Date(0)}, {transfer:[buffer]});
      assert.equal(buffer.byteLength,0); assert.equal(mixed.buffer.byteLength,4); assert.equal(mixed.date.getTime(),0);
      const response=await submit(base,player.token,{requestId:'clone',stationId:'alpha'});
      assert.deepEqual(response.data.state,expected);
      assert.deepEqual(structuredClone(await state(base,player.token)),expected);
    }`);
  const result = await runScenario(path);
  assert.equal(result.status, 'passed', JSON.stringify(result));
});


test('debug reads plus status and reason strings cannot substitute for resource assertions', async (t) => {
  let code = await readFile(scenarioPath, 'utf8');
  code = code.replace("from './client.mjs'", `from ${JSON.stringify(clientUrl)}`);
  code = code.split('\n').filter((line) => !line.includes('assert.deepEqual(') && !line.includes('receipts.length, 0')).join('\n');
  code = code.replace("const far = await state(base, player.token);", "const far = await state(base, player.token); JSON.stringify(far);");
  code = code.replace("assert.equal(first.data.reason, 'repaired');", "assert.equal(first.data.reason, 'repaired'); assert.equal(first.data.receipt.creditsSpent, 2);");
  const path = await source(t, code);
  const result = await assess({ repair, policyPath, scenarioPath: path });
  const failures = result.criteria.filter((item) => !item.passed).map((item) => item.name);
  assert.equal(result.passed, false);
  assert.ok(failures.includes('HTTP scenario: two-energy repair'));
  assert.ok(failures.includes('HTTP scenario: wrong receipt balance'));
  assert.ok(failures.includes('HTTP scenario: range refusal debits credit'));
  assert.ok(result.criteria.filter((item) => item.name.includes('submitted policy') || correctPolicies.some(({name}) => item.name === `HTTP scenario: ${name}`)).every(({passed}) => passed));
});

for (const style of ['strict credits first', 'strict receipts first', 'loose assert', 'callable assert', 'in-place receipt sort']) {
  test(`${style} preserves genuine early assertion failures and ordinary JSON`, async (t) => {
    const statements = style === 'callable assert'
      ? "assert(actor.energy === 7); assert(actor.credits === 4); assert(actor.receipts.length === 1);"
      : style === 'strict receipts first'
        ? "assert.deepEqual(actor.receipts, [response.data.receipt]); assert.equal(actor.energy,7); assert.equal(actor.credits,4);"
        : "assert.equal(actor.energy,7); assert.equal(actor.credits,4); assert.deepEqual(actor.receipts, [response.data.receipt]);";
    const module = style === 'loose assert' || style === 'callable assert' ? 'node:assert' : 'node:assert/strict';
    const code = `import assert from '${module}'; import {session,state,submit} from ${JSON.stringify(clientUrl)};
      export async function scenario({base}) { const p=await session(base); await state(base,p.token); const response=await submit(base,p.token,{requestId:'style',stationId:'alpha'}); const actor=response.data.state.actors[0]; ${style === 'in-place receipt sort' ? 'actor.receipts.sort((a,b)=>a.requestId.localeCompare(b.requestId));' : ''} ${statements} }`;
    const path = await source(t, code);
    assert.equal((await runScenario(path)).status, 'passed');
    const wrong = await runScenario(path, { variant: 'one-credit repair' });
    assert.equal(wrong.status, 'assertion-failure', JSON.stringify(wrong));
    assert.doesNotMatch(wrong.error.message, /Getter|Setter|fabricated/);
  });
}

test('expected-pass output is retained with a small bound and assertion diffs show real values', async (t) => {
  const code = `import assert from 'node:assert/strict'; import {session,state,submit} from ${JSON.stringify(clientUrl)};
    export async function scenario({base}) { console.log('diagnostic note'); const p=await session(base); await state(base,p.token); const r=await submit(base,p.token,{requestId:'diff',stationId:'alpha'}); assert.deepEqual(r.data.receipt,{requestId:'diff',stationId:'alpha',energyAdded:3,creditsSpent:2,energy:7,credits:4}); }`;
  const path = await source(t, code);
  assert.match((await runScenario(path)).output, /diagnostic note/);
  const wrong = await runScenario(path, { variant: 'one-credit repair' });
  assert.match(wrong.error.message, /creditsSpent/);
  assert.doesNotMatch(wrong.error.message, /Getter|Setter/);
  assert.equal(wrong.error.actual.credits, 5);
  assert.equal(wrong.error.expected.credits, 4);
});

test('policy TypeErrors are HTTP 500 while malformed requests remain HTTP 400', async () => {
  await withRepairServer(async (server) => {
    const p = await session(server.base);
    const before = server.snapshot();
    assert.equal((await submit(server.base, p.token, { extra: true })).status, 400);
    const result = await submit(server.base, p.token, body);
    assert.equal(result.status, 500);
    assert.deepEqual(result.data, { error: 'policy-failure', name: 'TypeError' });
    assert.deepEqual(server.snapshot(), before);
  }, { policy() { throw new TypeError('ordinary policy bug'); } });
});

test('scenario receives no variant name or captured policy path in process argv', async (t) => {
  const code = `import assert from 'node:assert/strict'; import {session,state,submit} from ${JSON.stringify(clientUrl)};
    export async function scenario({base}) { assert.equal(process.argv.length,1); const p=await session(base); await state(base,p.token); await submit(base,p.token,{requestId:'argv',stationId:'alpha'}); }`;
  assert.equal((await runScenario(await source(t, code))).status, 'passed');
});


test('multi-failure fixtures reject the formerly undetected reordered policy', () => {
  const reordered = (state, id, request) => {
    const actor = state.actors.find((value) => value.id === id);
    const station = state.stations.find((value) => value.id === request.stationId);
    const old = actor.receipts.some((value) => value.requestId === request.requestId);
    if (old || !station) return repair(state, id, request);
    const deny = (reason) => ({reason, receipt:null, state:structuredClone(state)});
    if (Math.hypot(actor.x-station.x,actor.y-station.y)>state.config.rangeMm) return deny('range');
    if (actor.credits<state.config.repairCost) return deny('funds');
    if (actor.energy>=state.config.energyCap) return deny('full');
    return repair(state,id,request);
  };
  const result = assessPolicy({repair:reordered});
  assert.equal(result.passed,false);
  assert.ok(result.criteria.some(({name,passed}) => name === 'history takes precedence over range full and funds' && !passed));
  assert.ok(result.criteria.some(({name,passed}) => name === 'full energy takes precedence over funds' && !passed));
});

test('a later scenario runner failure retains earlier completed diagnostics', async t => {
 const authorUrl = new URL('../capstone/author-scenario.mjs', import.meta.url).href;
 const path = await source(t, `import {scenario as original} from ${JSON.stringify(authorUrl)};
import {session,submit} from ${JSON.stringify(clientUrl)};
export async function scenario(context){
 console.log('panel-history-marker');
 const p=await session(context.base);
 const result=await submit(context.base,p.token,{requestId:'preflight',stationId:'alpha'});
 if(result.data.state.actors.find(actor=>actor.id===p.id).credits===5){await new Promise(()=>{});}
 await original(context);
}`);
 await assert.rejects(assess({repair,scenarioPath:path,policyPath},{timeout:300}),error=>{
  assert.equal(error.name,'ScenarioRunnerError');
  const rows=error.input.scenarios;
  assert.ok(rows.length>3);
  assert.equal(rows.at(-1).status,'runner-failure');
  assert.match(rows[0].output,/panel-history-marker/);
  assert.match(rows.at(-1).output,/panel-history-marker/);
  assert.equal(rows.filter(row=>row.status==='passed').length,3);
  assert.ok(error.input.completedCriteria.length>48);
  assert.equal(error.input.completedCriteria.filter(row=>row.passed).length,error.input.completedCriteria.length);
  assert.match(error.input.incompleteCriterion,/one-credit repair/);
  return true;
 });
});

test('response-first assertions can detect a wrong receipt before the first state read', async t => {
 const path=await source(t, `import assert from 'node:assert/strict';
import {session,submit,state} from ${JSON.stringify(clientUrl)};
export async function scenario({base}){
 const p=await session(base);
 const response=await submit(base,p.token,{requestId:'response-first',stationId:'alpha'});
 assert.deepEqual(response.data.receipt,{requestId:'response-first',stationId:'alpha',energyAdded:3,creditsSpent:2,energy:7,credits:4});
 await state(base,p.token);
}`);
 assert.equal((await runScenario(path)).status,'passed');
 for(const variant of ['one-credit repair','two-energy repair','wrong receipt balance']){
  const result=await runScenario(path,{variant});
  assert.equal(result.status,'assertion-failure');
  assert.equal(result.activity.stateReads,0);
  assert.equal(result.activity.repairRequests,1);
 }
});
